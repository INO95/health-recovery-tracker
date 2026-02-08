REVISION = "0004_add_upload_error_message"


def _sqlite_has_column(conn, table_name: str, column_name: str) -> bool:
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return any(r[1] == column_name for r in rows)


def _sqlite_upgrade(conn) -> None:
    if not _sqlite_has_column(conn, "uploads", "error_message"):
        conn.exec_driver_sql("ALTER TABLE uploads ADD COLUMN error_message TEXT")


def _postgres_upgrade(conn) -> None:
    conn.exec_driver_sql("ALTER TABLE uploads ADD COLUMN IF NOT EXISTS error_message VARCHAR(512)")


def upgrade(conn, dialect_name: str) -> None:
    if dialect_name == "sqlite":
        _sqlite_upgrade(conn)
        return
    _postgres_upgrade(conn)

