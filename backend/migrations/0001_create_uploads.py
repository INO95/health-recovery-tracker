REVISION = "0001_create_uploads"


def upgrade(conn, dialect_name: str) -> None:
    if dialect_name == "sqlite":
        conn.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS uploads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                content_type TEXT,
                status TEXT NOT NULL,
                storage_path TEXT NOT NULL DEFAULT '',
                parser_version TEXT NOT NULL,
                queue_job_id TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CHECK (status IN ('pending','processing','parsed','failed'))
            )
            """
        )
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads(created_at)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status)")
        return

    conn.exec_driver_sql(
        """
        CREATE TABLE IF NOT EXISTS uploads (
            id BIGSERIAL PRIMARY KEY,
            filename VARCHAR(255) NOT NULL,
            content_type VARCHAR(128),
            status VARCHAR(32) NOT NULL,
            storage_path VARCHAR(512) NOT NULL DEFAULT '',
            parser_version VARCHAR(64) NOT NULL,
            queue_job_id VARCHAR(128),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uploads_status_check
                CHECK (status IN ('pending','processing','parsed','failed'))
        )
        """
    )
    conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads(created_at)")
    conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status)")

