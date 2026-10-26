from api.services.dataset_service import dataset_service
from api.database.hana_table_service import hana_table_service
from api.utils.logger import get_logger

logger = get_logger("services.upload_service")


class UploadService:
    def process_file(
        self,
        content: bytes,
        filename: str,
        async_index: bool = None,
        transformation_plan=None,
        target_table_name: str = None,
        target_table_action: str = None,
    ):
        # 1. Mandatory existing flow: version snapshots, text chunking & VECTOR_TABLE embedding
        result = dataset_service.upload(content, filename, async_index=async_index, transformation_plan=transformation_plan)
        
        # 2. Dual-storage: Persist structured tabular rows into user's designated HANA table
        cloud_table_info = None
        if target_table_name and target_table_action and target_table_action.lower() != "none":
            try:
                if transformation_plan is None:
                    df = dataset_service.parse_file(content, filename)
                else:
                    from api.platform.ingestion import ingestion_service
                    df, _ = ingestion_service.prepare(content, filename, transformation_plan)
                
                cloud_table_info = hana_table_service.persist_dataframe(
                    df=df,
                    table_name=target_table_name,
                    action=target_table_action.lower(),
                )
                logger.info(f"HANA relational table sync completed for '{target_table_name}'.")
            except Exception as e:
                logger.error(f"HANA table sync error for '{target_table_name}': {e}")
                cloud_table_info = {
                    "success": False,
                    "table_name": target_table_name,
                    "error": str(e),
                    "message": f"File version was saved, but HANA table sync encountered an issue: {str(e)}",
                }

        message = result["message"]
        if cloud_table_info and cloud_table_info.get("success"):
            message += f" Stored into HANA table '{cloud_table_info['table_name']}' ({cloud_table_info['rows_inserted']} rows)."
        elif cloud_table_info and not cloud_table_info.get("success"):
            message += f" (HANA Table Warning: {cloud_table_info.get('error')})"

        return {
            "filename": result["dataset"]["currentFilename"],
            "rows_processed": result["dataset"]["rowCount"],
            "embeddings_generated": result["embeddings_generated"],
            "embedding_status": result["dataset"]["embeddingStatus"],
            "dataset": result["dataset"],
            "version": result["version"],
            "status": "success",
            "message": message,
            "cloud_table": cloud_table_info,
        }


upload_service = UploadService()
