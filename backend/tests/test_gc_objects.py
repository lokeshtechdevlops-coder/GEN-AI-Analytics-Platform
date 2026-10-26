"""Tests for garbage collection of unreferenced content-addressed objects."""
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
spec = importlib.util.spec_from_file_location("gc_objects", Path(__file__).resolve().parents[2] / "scripts/gc_objects.py")
gc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gc)

from api.platform.storage import ArtifactStore, DatasetRepository
from api.platform.store import MetadataStore


class GarbageCollectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.objects_root = self.root / ".objects"
        self.objects_store = ArtifactStore(backend="local", root=str(self.objects_root))
        self.metadata_path = self.root / ".metadata.sqlite3"
        self.meta_store = MetadataStore(path=str(self.metadata_path), backend="sqlite")
        self.repo = DatasetRepository(store=self.meta_store, objects=self.objects_store, workspace="test-ws")

    def tearDown(self):
        self.tmp.cleanup()

    def test_dry_run_identifies_orphaned_hash_without_deleting(self):
        # 1. Create a live snapshot in the repo
        snapshot_data = {"columns": [{"name": "ID", "type": "string"}], "rows": [{"ID": "001"}]}
        snapshot_ref = self.repo.save_snapshot(snapshot_data)
        manifest = json.loads(self.objects_store.get(snapshot_ref))
        data_hash = manifest["data"].replace("objects/", "")
        index_hash = manifest["index"].replace("objects/", "")
        snapshot_hash = snapshot_ref.replace("objects/", "")

        # Publish catalog referencing snapshot_ref
        with self.repo.writer():
            catalog = {
                "datasets": {
                    "ds1": {
                        "id": "ds1",
                        "name": "Dataset 1",
                        "versions": [{"version": 1, "snapshotKey": snapshot_ref}]
                    }
                }
            }
            self.repo.publish(catalog)

        # 2. Put an orphaned artifact into ArtifactStore
        orphan_ref = self.objects_store.put(b"orphaned content unreferenced by any catalog")
        orphan_hash = orphan_ref.replace("objects/", "")

        # 3. Run GC in dry-run mode
        report = gc.run_garbage_collection(dry_run=True, store=self.meta_store, objects=self.objects_store)

        self.assertTrue(report["dry_run"])
        self.assertEqual(report["total_stored_objects"], 4)  # snapshot manifest + data + index + orphan
        self.assertEqual(report["orphaned_count"], 1)
        self.assertEqual(report["orphaned_objects"][0]["hash"], orphan_hash)
        self.assertEqual(report["deleted_count"], 0)

        # Confirm all 4 files still exist on disk
        self.assertTrue((self.objects_root / "objects" / orphan_hash).exists())
        self.assertTrue((self.objects_root / "objects" / snapshot_hash).exists())
        self.assertTrue((self.objects_root / "objects" / data_hash).exists())
        self.assertTrue((self.objects_root / "objects" / index_hash).exists())

    def test_apply_mode_deletes_orphaned_and_preserves_live_snapshots(self):
        # 1. Create live snapshot
        snapshot_ref = self.repo.save_snapshot({"columns": [], "rows": []})
        manifest = json.loads(self.objects_store.get(snapshot_ref))
        data_hash = manifest["data"].replace("objects/", "")
        index_hash = manifest["index"].replace("objects/", "")
        snapshot_hash = snapshot_ref.replace("objects/", "")

        with self.repo.writer():
            self.repo.publish({
                "datasets": {
                    "ds1": {"versions": [{"version": 1, "snapshotKey": snapshot_ref}]}
                }
            })

        # 2. Put orphan
        orphan_ref = self.objects_store.put(b"orphaned content")
        orphan_hash = orphan_ref.replace("objects/", "")

        # 3. Run GC in apply mode
        report = gc.run_garbage_collection(dry_run=False, store=self.meta_store, objects=self.objects_store)

        self.assertFalse(report["dry_run"])
        self.assertEqual(report["orphaned_count"], 1)
        self.assertEqual(report["deleted_count"], 1)

        # Orphan should be deleted
        self.assertFalse((self.objects_root / "objects" / orphan_hash).exists())

        # Live snapshots must remain intact and readable
        self.assertTrue((self.objects_root / "objects" / snapshot_hash).exists())
        self.assertTrue((self.objects_root / "objects" / data_hash).exists())
        self.assertTrue((self.objects_root / "objects" / index_hash).exists())

        # Snapshot retrieval still succeeds
        loaded = self.repo.snapshot(snapshot_ref)
        self.assertEqual(loaded["columns"], [])


if __name__ == "__main__":
    unittest.main()
