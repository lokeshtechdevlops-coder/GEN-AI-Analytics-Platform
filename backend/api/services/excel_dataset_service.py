import os
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
from datetime import datetime, timezone
import pandas as pd
from api.config import settings
from api.utils.logger import get_logger

logger = get_logger("services.excel_dataset_service")


class ExcelDatasetService:
    def __init__(self):
        self._df: Optional[pd.DataFrame] = None
        self._data_as_of: Optional[datetime] = None
        self._file_mtime: Optional[float] = None
        self._last_load_time: Optional[datetime] = None
        self._loaded_path: Optional[Path] = None
        # Base path pointing to preprocessing/output/SAC_Sales_Preprocessed.xlsx
        self._default_path = Path(__file__).resolve().parent.parent.parent / "preprocessing" / "output" / "SAC_Sales_Preprocessed.xlsx"

    def _resolve_dataset_path(self) -> Path:
        from api.services.dataset_service import dataset_service
        if dataset_service.catalog_path.exists():
            return dataset_service.active_path() or dataset_service.output_dir / ".no_active_dataset"
        candidates = [
            self._default_path,
            Path(__file__).resolve().parent.parent.parent / "preprocessing" / "output" / "SAC_Sales_Preprocessed.xlsx",
            Path.cwd() / "preprocessing" / "output" / "SAC_Sales_Preprocessed.xlsx",
            Path.cwd() / "backend" / "preprocessing" / "output" / "SAC_Sales_Preprocessed.xlsx",
            Path(__file__).resolve().parent.parent.parent / "preprocessing" / "input" / "SAC_Sales_Flat_SingleSheet.xlsx",
            Path.cwd() / "preprocessing" / "input" / "SAC_Sales_Flat_SingleSheet.xlsx",
            Path.cwd() / "backend" / "preprocessing" / "input" / "SAC_Sales_Flat_SingleSheet.xlsx",
        ]
        for candidate in candidates:
            if candidate.exists():
                return candidate
        return self._default_path

    def _needs_reload(self) -> bool:
        """
        Determine whether the dataset should be reloaded.
        Returns True if:
          - Data has never been loaded.
          - The underlying file has been modified since last load.
          - The data is older than DATA_REFRESH_INTERVAL_MINUTES.
        """
        if self._df is None:
            return True

        resolved_path = self._resolve_dataset_path()
        if not resolved_path.exists():
            return True

        # Check if file on disk has a newer mtime than what we loaded
        current_mtime = resolved_path.stat().st_mtime
        if resolved_path != self._loaded_path:
            return True
        if self._file_mtime is not None and current_mtime != self._file_mtime:
            logger.info(
                f"[DataFreshness] File mtime changed "
                f"({self._file_mtime:.0f} → {current_mtime:.0f}), triggering reload."
            )
            return True

        # Check if data is older than the configured refresh interval
        if self._last_load_time is not None:
            elapsed = (datetime.now(timezone.utc) - self._last_load_time).total_seconds()
            refresh_seconds = settings.DATA_REFRESH_INTERVAL_MINUTES * 60
            if elapsed >= refresh_seconds:
                logger.info(
                    f"[DataFreshness] Data age ({elapsed:.0f}s) exceeds "
                    f"refresh interval ({refresh_seconds}s), triggering reload."
                )
                return True

        return False

    def _load_dataset(self) -> pd.DataFrame:
        """Load (or reload) the dataset from disk and update freshness metadata."""
        resolved_path = self._resolve_dataset_path()
        if not resolved_path.exists():
            logger.warning(f"Excel dataset not found at candidate paths. Returning empty DataFrame until uploaded by user.")
            self._df = pd.DataFrame()
            self._data_as_of = None
            self._file_mtime = None
            self._last_load_time = datetime.now(timezone.utc)
            return self._df

        self._default_path = resolved_path
        logger.info(f"Loading preprocessed Excel dataset from: {self._default_path}")

        from api.services.dataset_service import dataset_service
        entry, snapshot = dataset_service.active()
        if entry:
            self._df = dataset_service._frame(snapshot["rows"], snapshot["columns"])
            for column in snapshot["columns"]:
                if column["type"] == "date":
                    self._df[column["name"]] = pd.to_datetime(self._df[column["name"]], errors="coerce")
        else:
            self._df = pd.read_csv(self._default_path) if self._default_path.suffix.lower() == ".csv" else pd.read_excel(self._default_path)
        self._loaded_path = self._default_path

        # Record freshness metadata
        stat = self._default_path.stat()
        self._file_mtime = stat.st_mtime
        self._data_as_of = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
        self._last_load_time = datetime.now(timezone.utc)

        # Cache fast binary pickle format for external scripts & subprocesses
        try:
            pkl_path = self._default_path.with_suffix(".pkl")
            if not pkl_path.exists() and self._df is not None and not self._df.empty:
                self._df.to_pickle(pkl_path)
                logger.info(f"Cached fast pickle dataset: {pkl_path}")
        except Exception as pkl_err:
            logger.warning(f"Failed to cache pickle dataset: {pkl_err}")

        logger.info(
            f"Dataset loaded successfully — shape={self._df.shape}, "
            f"data_as_of={self._data_as_of.isoformat()}"
        )
        return self._df

    def get_df(self) -> pd.DataFrame:
        """
        Return the current DataFrame, reloading from disk if stale or unloaded.
        Guarantees freshness within DATA_REFRESH_INTERVAL_MINUTES.
        """
        from api.models.execution_context import current_selection
        selection = current_selection.get()
        if selection is not None:
            from api.services.dataset_service import dataset_service
            return dataset_service._frame(selection.snapshot["rows"], selection.snapshot["columns"])
        if self._needs_reload():
            self._load_dataset()
        return self._df

    def get_data_as_of(self) -> Optional[str]:
        """Return the ISO 8601 UTC timestamp of the data source's last modification."""
        self.get_df()
        return self._data_as_of.isoformat() if self._data_as_of else None

    def get_records_in_source(self) -> int:
        """Return the total number of records in the source dataset."""
        return len(self.get_df())

    def get_dataset_path(self) -> Path:
        return self._resolve_dataset_path()

    def get_fast_dataset_path(self) -> Path:
        resolved = self._resolve_dataset_path()
        pkl = resolved.with_suffix(".pkl")
        if pkl.exists():
            return pkl
        return resolved

    def parse_dataset(self, file_path: str) -> Dict[str, Any]:
        df = self.get_df()
        return {
            "status": "success",
            "file_path": str(self._default_path),
            "rows": len(df),
            "columns": df.columns.tolist(),
            "data_as_of": self.get_data_as_of(),
        }

    def check_health(self, max_stale_hours: Optional[float] = None) -> Dict[str, Any]:
        """
        Perform a loud health check on the data source.
        Raises RuntimeError if:
          - The dataset file cannot be found.
          - The dataset file is empty.
          - The data is staler than max_stale_hours.
        Returns a status dict on success.
        """
        threshold = max_stale_hours if max_stale_hours is not None else settings.DATA_STALE_MAX_HOURS

        resolved_path = self._resolve_dataset_path()
        if not resolved_path.exists():
            msg = f"[HealthCheck FAIL] Dataset file not found at any candidate path. Primary: {self._default_path}"
            logger.error(msg)
            raise RuntimeError(msg)

        file_size = resolved_path.stat().st_size
        if file_size == 0:
            msg = f"[HealthCheck FAIL] Dataset file is empty (0 bytes): {resolved_path}"
            logger.error(msg)
            raise RuntimeError(msg)

        file_mtime = datetime.fromtimestamp(resolved_path.stat().st_mtime, tz=timezone.utc)
        age_hours = (datetime.now(timezone.utc) - file_mtime).total_seconds() / 3600.0

        if age_hours > threshold:
            msg = (
                f"[HealthCheck FAIL] Dataset is stale: last modified {age_hours:.1f} hours ago "
                f"(threshold: {threshold:.1f} hours). Path: {resolved_path}"
            )
            logger.error(msg)
            raise RuntimeError(msg)

        # Try actually reading the file
        try:
            df = self.get_df()
            if df.empty:
                msg = f"[HealthCheck FAIL] Dataset loaded but contains 0 rows: {resolved_path}"
                logger.error(msg)
                raise RuntimeError(msg)
        except FileNotFoundError:
            raise
        except Exception as exc:
            msg = f"[HealthCheck FAIL] Cannot read dataset: {exc}"
            logger.error(msg)
            raise RuntimeError(msg) from exc

        result = {
            "status": "healthy",
            "path": str(resolved_path),
            "rows": len(df),
            "columns": len(df.columns),
            "data_as_of": file_mtime.isoformat(),
            "age_hours": round(age_hours, 2),
            "threshold_hours": threshold,
        }
        logger.info(f"[HealthCheck OK] {result}")
        return result


excel_dataset_service = ExcelDatasetService()
