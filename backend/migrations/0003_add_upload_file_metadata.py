REVISION = "0003_add_upload_file_metadata"


def _sqlite_has_column(conn, table_name: str, column_name: str) -> bool:
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(r[1] == column_name for r in rows)


def _sqlite_upgrade(conn) -> None:
    if not _sqlite_has_column(conn, "uploads", "original_filename"):
        conn.exec_driver_sql("ALTER TABLE uploads ADD COLUMN original_filename TEXT")
    if not _sqlite_has_column(conn, "uploads", "size_bytes"):
        conn.exec_driver_sql("ALTER TABLE uploads ADD COLUMN size_bytes INTEGER")
    conn.exec_driver_sql("UPDATE uploads SET original_filename = filename WHERE original_filename IS NULL OR original_filename = ''")


def _postgres_upgrade(conn) -> None:
    conn.exec_driver_sql("ALTER TABLE uploads ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255)")
    conn.exec_driver_sql("ALTER TABLE uploads ADD COLUMN IF NOT EXISTS size_bytes BIGINT")
    conn.exec_driver_sql("UPDATE uploads SET original_filename = filename WHERE original_filename IS NULL OR original_filename = ''")


def upgrade(conn, dialect_name: str) -> None:
    if dialect_name == "sqlite":
        _sqlite_upgrade(conn)
        return
    _postgres_upgrade(conn)

