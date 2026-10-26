import logging
import threading
from api.config import settings
from api.utils.logger import get_logger

logger = get_logger("database.connection")

try:
    from hdbcli import dbapi
    HDBCLI_AVAILABLE = True
except ImportError:
    HDBCLI_AVAILABLE = False
    logger.warning("hdbcli module not available. SAP HANA database integration is disabled.")

import queue

class HANAConnectionManager:
    def __init__(self):
        self.address = settings.HANA_ADDRESS
        self.port = settings.HANA_PORT
        self.user = settings.HANA_USER
        self.password = settings.HANA_PASSWORD
        self.schema = settings.HANA_SCHEMA
        self._max_pool_size = settings.HANA_POOL_SIZE
        self._pool = queue.Queue(maxsize=self._max_pool_size)

    def _create_connection(self):
        conn = None
        try:
            conn = dbapi.connect(
                address=self.address,
                port=self.port,
                user=self.user,
                password=self.password,
                encrypt="true",
                sslValidateCertificate="true" if settings.HANA_VALIDATE_CERT else "false"
            )
            if self.schema:
                cursor = conn.cursor()
                try:
                    schema_identifier = self.schema.replace('"', '""')
                    cursor.execute(f'SET SCHEMA "{schema_identifier}"')
                finally:
                    cursor.close()
            return conn
        except Exception as e:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass
            logger.error("Failed to connect to the configured SAP HANA schema (%s).", type(e).__name__)
            return None

    def get_connection(self):
        if not HDBCLI_AVAILABLE:
            return None
        
        # Try to get an existing connection from the pool
        try:
            conn = self._pool.get_nowait()
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT 1 FROM DUMMY")
                cursor.close()
                return conn
            except Exception:
                try:
                    conn.close()
                except Exception:
                    pass
        except queue.Empty:
            pass

        return self._create_connection()

    def return_connection(self, conn):
        """Return a connection to the pool"""
        if not conn:
            return
        try:
            self._pool.put_nowait(conn)
        except queue.Full:
            try:
                conn.close()
            except Exception:
                pass

    def is_connected(self) -> bool:
        conn = self.get_connection()
        if conn:
            self.return_connection(conn)
            return True
        return False

db_manager = HANAConnectionManager()
