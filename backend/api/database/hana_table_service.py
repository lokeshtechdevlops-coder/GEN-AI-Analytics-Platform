import re
import math
from typing import List, Dict, Any, Optional
import pandas as pd
from api.database.connection import db_manager
from api.config import settings
from api.utils.logger import get_logger

logger = get_logger("database.hana_table_service")

# Reserved / internal tables that should not be listed as business tables
INTERNAL_TABLES = {"VECTOR_TABLE", "CHAT_SESSIONS", "CHAT_MESSAGES"}


class HANATableService:
    def sanitize_identifier(self, name: str) -> str:
        """Sanitize table or column name into a valid SAP HANA SQL identifier."""
        # Strip file extensions if present
        name = re.sub(r"\.(xlsx|xls|csv)$", "", str(name or ""), flags=re.IGNORECASE)
        # Replace invalid characters with underscore
        clean = re.sub(r"[^A-Za-z0-9_]", "_", name.strip())
        # Collapse multiple underscores
        clean = re.sub(r"_+", "_", clean).strip("_").upper()
        if not clean:
            clean = "UPLOADED_TABLE"
        # Ensure it doesn't start with a digit
        if clean[0].isdigit():
            clean = f"T_{clean}"
        return clean[:64]

    def list_user_tables(self) -> List[Dict[str, Any]]:
        """List all user-accessible business tables in the configured HANA schema."""
        conn = db_manager.get_connection()
        if not conn:
            logger.warning("HANA Database connection unavailable for table listing.")
            return []

        cursor = None
        tables = []
        try:
            cursor = conn.cursor()
            schema = settings.HANA_SCHEMA
            if schema:
                schema_id = schema.replace('"', '""')
                cursor.execute(f'SET SCHEMA "{schema_id}"')

            # Fetch table names from SYS.TABLES in CURRENT_SCHEMA
            cursor.execute(
                """
                SELECT SCHEMA_NAME, TABLE_NAME, TABLE_TYPE 
                FROM SYS.TABLES 
                WHERE SCHEMA_NAME = CURRENT_SCHEMA
                ORDER BY TABLE_NAME ASC
                """
            )
            rows = cursor.fetchall()

            # Batch query row counts in a single query from SYS.M_TABLES
            table_counts = {}
            try:
                cursor.execute(
                    """
                    SELECT TABLE_NAME, RECORD_COUNT 
                    FROM SYS.M_TABLES 
                    WHERE SCHEMA_NAME = CURRENT_SCHEMA
                    """
                )
                for rc_table, rc_count in cursor.fetchall():
                    table_counts[rc_table] = int(rc_count) if rc_count is not None else 0
            except Exception as e:
                logger.debug(f"SYS.M_TABLES bulk count query unavailable ({e}), will use fallback if needed.")

            # Batch query all column definitions in one single query
            cols_by_table = {}
            try:
                cursor.execute(
                    """
                    SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE_NAME, LENGTH, SCALE 
                    FROM SYS.TABLE_COLUMNS 
                    WHERE SCHEMA_NAME = CURRENT_SCHEMA
                    ORDER BY TABLE_NAME ASC, POSITION ASC
                    """
                )
                for col_table, col_name, data_type, length, scale in cursor.fetchall():
                    cols_by_table.setdefault(col_table, []).append(
                        {
                            "name": col_name,
                            "type": data_type,
                            "length": length,
                            "scale": scale,
                        }
                    )
            except Exception as e:
                logger.debug(f"SYS.TABLE_COLUMNS bulk query unavailable ({e}), will use fallback if needed.")

            for schema_name, table_name, table_type in rows:
                if table_name.upper() in INTERNAL_TABLES:
                    continue

                # Query row count safely with fallback
                row_count = table_counts.get(table_name)
                if row_count is None:
                    try:
                        cursor.execute(f'SELECT COUNT(*) FROM "{schema_name}"."{table_name}"')
                        rc_row = cursor.fetchone()
                        row_count = int(rc_row[0]) if rc_row else 0
                    except Exception as e:
                        logger.debug(f"Could not count rows for {schema_name}.{table_name}: {e}")
                        row_count = 0

                columns = cols_by_table.get(table_name)
                if columns is None:
                    try:
                        cursor.execute(
                            """
                            SELECT COLUMN_NAME, DATA_TYPE_NAME, LENGTH, SCALE 
                            FROM SYS.TABLE_COLUMNS 
                            WHERE SCHEMA_NAME = ? AND TABLE_NAME = ?
                            ORDER BY POSITION ASC
                            """,
                            (schema_name, table_name),
                        )
                        cols = cursor.fetchall()
                        columns = [
                            {
                                "name": col[0],
                                "type": col[1],
                                "length": col[2],
                                "scale": col[3],
                            }
                            for col in cols
                        ]
                    except Exception as e:
                        logger.debug(f"Could not fetch columns for {schema_name}.{table_name}: {e}")
                        columns = []

                tables.append(
                    {
                        "name": table_name,
                        "schema": schema_name,
                        "type": table_type,
                        "rowCount": row_count,
                        "columnCount": len(columns),
                        "columns": columns,
                    }
                )
            return tables
        except Exception as e:
            logger.error(f"Failed to list HANA tables: {e}")
            return []
        finally:
            if cursor:
                try:
                    cursor.close()
                except Exception:
                    pass
            db_manager.return_connection(conn)

    def table_exists(self, table_name: str) -> bool:
        """Check if a table exists in the current schema."""
        clean_name = self.sanitize_identifier(table_name)
        conn = db_manager.get_connection()
        if not conn:
            return False
        cursor = None
        try:
            cursor = conn.cursor()
            schema = settings.HANA_SCHEMA
            if schema:
                schema_id = schema.replace('"', '""')
                cursor.execute(f'SET SCHEMA "{schema_id}"')
            cursor.execute(
                "SELECT 1 FROM SYS.TABLES WHERE SCHEMA_NAME = CURRENT_SCHEMA AND TABLE_NAME = ?",
                (clean_name,),
            )
            return cursor.fetchone() is not None
        except Exception as e:
            logger.error(f"Error checking table existence for {clean_name}: {e}")
            return False
        finally:
            if cursor:
                try:
                    cursor.close()
                except Exception:
                    pass
            db_manager.return_connection(conn)

    def infer_column_types(self, df: pd.DataFrame) -> List[tuple[str, str]]:
        """Map DataFrame columns to appropriate SAP HANA Cloud SQL data types."""
        cols = []
        for col in df.columns:
            clean_col = self.sanitize_identifier(str(col))
            series = df[col].dropna()
            
            if series.empty:
                cols.append((clean_col, "NVARCHAR(500)"))
                continue

            dtype = df[col].dtype
            if pd.api.types.is_bool_dtype(dtype):
                hana_type = "BOOLEAN"
            elif pd.api.types.is_integer_dtype(dtype):
                hana_type = "BIGINT"
            elif pd.api.types.is_float_dtype(dtype):
                hana_type = "DECIMAL(15, 2)"
            elif pd.api.types.is_datetime64_any_dtype(dtype):
                has_time = any(getattr(t, 'hour', 0) != 0 or getattr(t, 'minute', 0) != 0 for t in series.head(20))
                hana_type = "TIMESTAMP" if has_time else "DATE"
            else:
                max_len = series.astype(str).str.len().max()
                if max_len > 500:
                    hana_type = "NCLOB"
                elif max_len > 255:
                    hana_type = "NVARCHAR(500)"
                else:
                    hana_type = "NVARCHAR(255)"
            
            cols.append((clean_col, hana_type))
        return cols

    def create_table(self, table_name: str, column_defs: List[tuple[str, str]]) -> bool:
        """Create a new COLUMN TABLE in SAP HANA Cloud."""
        clean_table = self.sanitize_identifier(table_name)
        col_sql_parts = [f'"{col_name}" {data_type}' for col_name, data_type in column_defs]
        sql = f'CREATE COLUMN TABLE "{clean_table}" ({", ".join(col_sql_parts)})'

        conn = db_manager.get_connection()
        if not conn:
            raise RuntimeError("HANA database is unavailable.")

        cursor = None
        try:
            conn.setautocommit(False)
            cursor = conn.cursor()
            schema = settings.HANA_SCHEMA
            if schema:
                schema_id = schema.replace('"', '""')
                cursor.execute(f'SET SCHEMA "{schema_id}"')

            logger.info(f"Creating HANA column table '{clean_table}' with {len(column_defs)} columns...")
            cursor.execute(sql)
            conn.commit()
            logger.info(f"Successfully created table '{clean_table}' in SAP HANA Cloud.")
            return True
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to create table '{clean_table}': {e}")
            raise e
        finally:
            if cursor:
                try:
                    cursor.close()
                except Exception:
                    pass
            db_manager.return_connection(conn)

    def persist_dataframe(
        self,
        df: pd.DataFrame,
        table_name: str,
        action: str = "create",
    ) -> Dict[str, Any]:
        """
        Persist structured rows from a DataFrame into a SAP HANA Cloud relational table.
        action: 'create', 'append', or 'replace'
        """
        clean_table = self.sanitize_identifier(table_name)
        if df is None or df.empty:
            return {"success": False, "message": "DataFrame contains no rows to insert.", "table_name": clean_table, "rows_inserted": 0}

        conn = db_manager.get_connection()
        if not conn:
            raise RuntimeError("HANA database is unavailable.")

        cursor = None
        try:
            schema = settings.HANA_SCHEMA
            conn.setautocommit(False)
            cursor = conn.cursor()
            if schema:
                schema_id = schema.replace('"', '""')
                cursor.execute(f'SET SCHEMA "{schema_id}"')

            # Check if table exists
            cursor.execute(
                "SELECT 1 FROM SYS.TABLES WHERE SCHEMA_NAME = CURRENT_SCHEMA AND TABLE_NAME = ?",
                (clean_table,),
            )
            exists = cursor.fetchone() is not None

            # Generate column definitions
            col_defs = self.infer_column_types(df)
            col_names = [c[0] for c in col_defs]

            if not exists or action == "create":
                if not exists:
                    # Create the table
                    col_sql_parts = [f'"{col_name}" {data_type}' for col_name, data_type in col_defs]
                    create_sql = f'CREATE COLUMN TABLE "{clean_table}" ({", ".join(col_sql_parts)})'
                    logger.info(f"Creating new table: {create_sql}")
                    cursor.execute(create_sql)
                elif action == "replace":
                    cursor.execute(f'DELETE FROM "{clean_table}"')
            elif action == "replace":
                cursor.execute(f'DELETE FROM "{clean_table}"')

            # Fetch existing columns from HANA to ensure column alignment
            cursor.execute(
                "SELECT COLUMN_NAME FROM SYS.TABLE_COLUMNS WHERE SCHEMA_NAME = CURRENT_SCHEMA AND TABLE_NAME = ? ORDER BY POSITION",
                (clean_table,),
            )
            table_cols = [r[0] for r in cursor.fetchall()]

            # Align DataFrame columns with table columns
            col_mapping = {self.sanitize_identifier(str(c)): c for c in df.columns}
            matched_cols = [c for c in table_cols if c in col_mapping]
            if not matched_cols:
                matched_cols = col_names

            # Prepare values for parameterized insert
            quoted_cols = ", ".join([f'"{c}"' for c in matched_cols])
            placeholders = ", ".join(["?" for _ in matched_cols])
            insert_sql = f'INSERT INTO "{clean_table}" ({quoted_cols}) VALUES ({placeholders})'

            def clean_val(v):
                if pd.isna(v) or v is None:
                    return None
                if hasattr(v, 'strftime'):
                    return v.strftime("%Y-%m-%d %H:%M:%S")
                if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                    return None
                return v

            records = []
            for _, row in df.iterrows():
                row_tuple = tuple(clean_val(row.get(col_mapping.get(c, c))) for c in matched_cols)
                records.append(row_tuple)

            # Insert in batches of 500
            batch_size = 500
            for start_idx in range(0, len(records), batch_size):
                batch = records[start_idx : start_idx + batch_size]
                cursor.executemany(insert_sql, batch)

            conn.commit()
            logger.info(f"Successfully stored {len(records)} rows into HANA table '{clean_table}'.")

            return {
                "success": True,
                "table_name": clean_table,
                "rows_inserted": len(records),
                "action": action,
                "message": f"Successfully loaded {len(records)} rows into SAP HANA Cloud table '{clean_table}'.",
            }
        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                except Exception:
                    pass
            logger.error(f"Failed to persist DataFrame into HANA table '{clean_table}': {e}")
            raise e
        finally:
            if cursor:
                try:
                    cursor.close()
                except Exception:
                    pass
            db_manager.return_connection(conn)


hana_table_service = HANATableService()
