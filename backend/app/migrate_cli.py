from app.database import build_engine, resolve_database_url
from app.migrate import run_migrations


def main() -> None:
    engine = build_engine(resolve_database_url())
    run_migrations(engine)
    print("migrate_up_ok")


if __name__ == "__main__":
    main()

