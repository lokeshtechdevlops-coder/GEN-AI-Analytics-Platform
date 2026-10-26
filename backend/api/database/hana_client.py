from typing import List, Dict, Any
from api.database.connection import db_manager
from api.utils.logger import get_logger

logger = get_logger("database.hana_client")

class HANAClient:
    def execute_query(self, sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
        conn = db_manager.get_connection()
        if not conn:
            logger.error("HANA Database connection is not active.")
            return []
        
        try:
            cursor = conn.cursor()
            cursor.execute(sql, params)
            if cursor.description:
                columns = [col[0] for col in cursor.description]
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            else:
                results = []
            conn.commit()
            cursor.close()
            # Return connection to pool instead of closing
            db_manager.return_connection(conn)
            return results
        except Exception as e:
            logger.error(f"Error executing SQL in HANA: {e}")
            # Return connection to pool even on error
            db_manager.return_connection(conn)
            raise e

hana_client = HANAClient()
