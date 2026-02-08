import importlib.util
from pathlib import Path

from sqlalchemy import text

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _load_migration_module(file_path: Path):
    spec = importlib.util.spec_from_file_location(file_path.stem, file_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed_to_load_migration:{file_path.name}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_migrations(engine) -> None:
    MIGRATIONS_DIR.mkdir(parents=True, exist_ok=True)
    migration_files = sorted(MIGRATIONS_DIR.glob("*.py"))

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    revision VARCHAR(64) PRIMARY KEY,
                    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        applied_rows = conn.execute(text("SELECT revision FROM schema_migrations")).fetchall()
        applied_revisions = {row[0] for row in applied_rows}

        for migration_file in migration_files:
            module = _load_migration_module(migration_file)
            revision = getattr(module, "REVISION", migration_file.stem)
            if revision in applied_revisions:
                continue
            upgrade = getattr(module, "upgrade", None)
            if not callable(upgrade):
                raise RuntimeError(f"missing_upgrade_function:{migration_file.name}")
            upgrade(conn, conn.dialect.name)
            conn.execute(
                text("INSERT INTO schema_migrations (revision) VALUES (:revision)"),
                {"revision": revision},
            )

