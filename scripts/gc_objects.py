"""Content-addressed object store garbage collection script.

Identifies and cleans up unreferenced/orphaned content hashes from ArtifactStore
without deleting live referenced dataset snapshots, indexes, or blobs.

Usage:
    python scripts/gc_objects.py --dry-run
    python scripts/gc_objects.py --apply
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

# Ensure backend modules can be imported
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from api.platform.storage import ArtifactStore
from api.platform.store import metadata_store

OBJECT_HASH_REGEX = re.compile(r"objects/([0-9a-fA-F]{64})")


def collect_referenced_hashes(store=None, objects=None, local_dir=None):
    """
    Collect all content hashes referenced by active catalogs, snapshots, and documents.
    Recursively inspects snapshot manifests to find transitive data and index hashes.
    """
    referenced = set()
    store = store or metadata_store()
    objects = objects or ArtifactStore()

    # 1. Inspect all documents in PLATFORM_DOCUMENTS
    try:
        with store.transaction() as cursor:
            cursor.execute("SELECT NAMESPACE, DOCUMENT_ID, PAYLOAD FROM PLATFORM_DOCUMENTS")
            rows = cursor.fetchall()
            for row in rows:
                payload_raw = row[2]
                payload_str = payload_raw.read() if hasattr(payload_raw, "read") else str(payload_raw)
                for match in OBJECT_HASH_REGEX.finditer(payload_str):
                    referenced.add(match.group(1).lower())
    except Exception as exc:
        # If PLATFORM_DOCUMENTS table is not yet initialized or unavailable in dev
        print(f"[GC] Note: Could not query PLATFORM_DOCUMENTS ({exc}); falling back to local files.")

    # 2. Inspect local catalog files if present
    output_dir = Path(local_dir or os.getenv("PLATFORM_OUTPUT_DIR", str(Path(__file__).resolve().parents[1] / "preprocessing" / "output")))
    catalog_file = output_dir / "datasets.json"
    if catalog_file.exists():
        try:
            content = catalog_file.read_text(encoding="utf-8")
            for match in OBJECT_HASH_REGEX.finditer(content):
                referenced.add(match.group(1).lower())
        except Exception as exc:
            print(f"[GC] Warning: Error reading {catalog_file}: {exc}")

    # 3. Recursively resolve manifests for referenced hashes
    # Snapshot manifests contain: {"data": "objects/<hash>", "index": "objects/<hash>"}
    uninspected = list(referenced)
    inspected = set()

    while uninspected:
        current_hash = uninspected.pop()
        if current_hash in inspected:
            continue
        inspected.add(current_hash)

        key = f"objects/{current_hash}"
        try:
            raw_bytes = objects.get(key)
            # Try parsing as JSON to find transitive references
            try:
                manifest = json.loads(raw_bytes.decode("utf-8"))
                if isinstance(manifest, dict):
                    for val in manifest.values():
                        if isinstance(val, str):
                            match = OBJECT_HASH_REGEX.search(val)
                            if match:
                                child_hash = match.group(1).lower()
                                referenced.add(child_hash)
                                if child_hash not in inspected:
                                    uninspected.append(child_hash)
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass
        except Exception:
            # Hash might not exist in store or failed get
            pass

    return referenced


def collect_stored_objects(objects=None):
    """
    List all stored content objects in the ArtifactStore.
    Returns a dict mapping hash -> (full_path_or_key, size_bytes).
    """
    objects = objects or ArtifactStore()
    stored = {}

    if objects.backend == "local":
        objects_dir = objects.root / "objects"
        if objects_dir.exists():
            for entry in objects_dir.iterdir():
                if entry.is_file() and not entry.name.endswith(".tmp"):
                    h = entry.name.lower()
                    if len(h) == 64 and all(c in "0123456789abcdef" for c in h):
                        stored[h] = (entry, entry.stat().st_size)
    else:
        # Cloud backends
        client = objects._client()
        try:
            if objects.backend == "s3":
                paginator = client.get_paginator("list_objects_v2")
                for page in paginator.paginate(Bucket=objects.bucket, Prefix="objects/"):
                    for obj in page.get("Contents", []):
                        key = obj["Key"]
                        if key.startswith("objects/") and len(key) == 72:
                            h = key[8:].lower()
                            stored[h] = (key, obj.get("Size", 0))
            elif objects.backend == "gcs":
                for blob in client.bucket(objects.bucket).list_blobs(prefix="objects/"):
                    key = blob.name
                    if key.startswith("objects/") and len(key) == 72:
                        h = key[8:].lower()
                        stored[h] = (key, blob.size or 0)
            elif objects.backend == "azure_blob":
                container = client.get_container_client(objects.bucket)
                for blob in container.list_blobs(name_starts_with="objects/"):
                    key = blob.name
                    if key.startswith("objects/") and len(key) == 72:
                        h = key[8:].lower()
                        stored[h] = (key, blob.size or 0)
        finally:
            if hasattr(client, "close"):
                client.close()

    return stored


def run_garbage_collection(dry_run=True, store=None, objects=None, local_dir=None):
    """
    Execute object garbage collection.
    Returns a report dictionary with scan statistics and orphaned hash details.
    """
    objects = objects or ArtifactStore()
    store = store or metadata_store()

    print("[GC] Scanning live references from catalog and metadata storage...")
    live_hashes = collect_referenced_hashes(store=store, objects=objects, local_dir=local_dir)
    print(f"[GC] Found {len(live_hashes)} referenced content hashes.")

    print(f"[GC] Scanning object store (backend: {objects.backend})...")
    stored_objects = collect_stored_objects(objects=objects)
    print(f"[GC] Found {len(stored_objects)} physical objects in storage.")

    orphaned_hashes = set(stored_objects.keys()) - live_hashes
    orphaned_details = []
    total_reclaimable_bytes = 0

    for h in sorted(orphaned_hashes):
        path_or_key, size = stored_objects[h]
        total_reclaimable_bytes += size
        orphaned_details.append({
            "hash": h,
            "key": f"objects/{h}",
            "size_bytes": size,
        })

    report = {
        "dry_run": dry_run,
        "total_stored_objects": len(stored_objects),
        "live_referenced_objects": len(live_hashes & set(stored_objects.keys())),
        "orphaned_count": len(orphaned_hashes),
        "reclaimable_bytes": total_reclaimable_bytes,
        "orphaned_objects": orphaned_details,
        "deleted_count": 0,
    }

    print("\n" + "=" * 60)
    print("OBJECT STORAGE GARBAGE COLLECTION REPORT")
    print("=" * 60)
    print(f"Mode: {'DRY RUN (No files modified)' if dry_run else 'APPLY (Deleting orphaned objects)'}")
    print(f"Total Stored Objects : {report['total_stored_objects']}")
    print(f"Live Referenced      : {report['live_referenced_objects']}")
    print(f"Orphaned Objects     : {report['orphaned_count']}")
    print(f"Reclaimable Storage  : {report['reclaimable_bytes']:,} bytes ({report['reclaimable_bytes'] / (1024*1024):.2f} MB)")
    print("=" * 60)

    if orphaned_details:
        print("\nIdentified Orphaned Objects:")
        for item in orphaned_details[:20]:
            print(f"  - {item['key']} ({item['size_bytes']:,} bytes)")
        if len(orphaned_details) > 20:
            print(f"  ... and {len(orphaned_details) - 20} more.")

    if not dry_run and orphaned_hashes:
        print("\n[GC] Deleting orphaned objects...")
        deleted = 0
        if objects.backend == "local":
            for h in orphaned_hashes:
                path, _ = stored_objects[h]
                try:
                    Path(path).unlink(missing_ok=True)
                    deleted += 1
                except Exception as exc:
                    print(f"[GC] Error deleting {path}: {exc}")
        else:
            client = objects._client()
            try:
                for h in orphaned_hashes:
                    key = f"objects/{h}"
                    try:
                        if objects.backend == "s3":
                            client.delete_object(Bucket=objects.bucket, Key=key)
                        elif objects.backend == "gcs":
                            client.bucket(objects.bucket).blob(key).delete()
                        elif objects.backend == "azure_blob":
                            client.get_blob_client(objects.bucket, key).delete_blob()
                        deleted += 1
                    except Exception as exc:
                        print(f"[GC] Error deleting {key}: {exc}")
            finally:
                if hasattr(client, "close"):
                    client.close()
        report["deleted_count"] = deleted
        print(f"[GC] Successfully deleted {deleted} orphaned objects.")
    elif dry_run and orphaned_hashes:
        print("\n[GC] Run with --apply to delete these orphaned objects.")
    else:
        print("\n[GC] Storage is clean; no orphaned objects found.")

    return report


def main():
    parser = argparse.ArgumentParser(description="Garbage collect unreferenced content-addressed objects.")
    parser.add_argument("--dry-run", action="store_true", default=True, help="Preview orphaned objects without deleting (default).")
    parser.add_argument("--apply", action="store_true", default=False, help="Permanently delete identified orphaned objects.")
    args = parser.parse_args()

    dry_run = not args.apply
    run_garbage_collection(dry_run=dry_run)


if __name__ == "__main__":
    main()
