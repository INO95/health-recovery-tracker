REVISION = "0002_convert_uploads_id_to_uuid"


def _uuid_sql_sqlite() -> str:
    return (
        "lower(hex(randomblob(4))) || '-' || "
        "lower(hex(randomblob(2))) || '-' || "
        "'4' || substr(lower(hex(randomblob(2))), 2) || '-' || "
        "substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || "
        "lower(hex(randomblob(6)))"
    )


def _sqlite_upgrade(conn) -> None:
    cols = conn.exec_driver_sql("PRAGMA table_info(uploads)").fetchall()
    id_col = next((c for c in cols if c[1] == "id"), None)
    if id_col is None:
        return
    id_type = str(id_col[2] or "").upper()
    if "INT" not in id_type:
        return

    conn.exec_driver_sql(
        """
        CREATE TABLE uploads_uuid (
            id TEXT PRIMARY KEY,
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
    conn.exec_driver_sql(
        f"""
        INSERT INTO uploads_uuid (
            id, filename, content_type, status, storage_path, parser_version, queue_job_id, created_at, updated_at
        )
        SELECT
            {_uuid_sql_sqlite()},
            filename,
            content_type,
            status,
            storage_path,
            parser_version,
            queue_job_id,
            created_at,
            updated_at
        FROM uploads
        """
    )
    conn.exec_driver_sql("DROP TABLE uploads")
    conn.exec_driver_sql("ALTER TABLE uploads_uuid RENAME TO uploads")
    conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads(created_at)")
    conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status)")


def _postgres_upgrade(conn) -> None:
    conn.exec_driver_sql('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')
    conn.exec_driver_sql("ALTER TABLE uploads ADD COLUMN IF NOT EXISTS id_uuid UUID")
    conn.exec_driver_sql("UPDATE uploads SET id_uuid = gen_random_uuid() WHERE id_uuid IS NULL")
    conn.exec_driver_sql("ALTER TABLE uploads ALTER COLUMN id_uuid SET NOT NULL")
    conn.exec_driver_sql("ALTER TABLE uploads DROP CONSTRAINT IF EXISTS uploads_pkey")
    conn.exec_driver_sql("ALTER TABLE uploads DROP COLUMN IF EXISTS id")
    conn.exec_driver_sql("ALTER TABLE uploads RENAME COLUMN id_uuid TO id")
    conn.exec_driver_sql("ALTER TABLE uploads ADD PRIMARY KEY (id)")


def upgrade(conn, dialect_name: str) -> None:
    if dialect_name == "sqlite":
        _sqlite_upgrade(conn)
        return
    _postgres_upgrade(conn)

