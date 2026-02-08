import os
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

Base = declarative_base()


def resolve_database_url(override: str = "") -> str:
    if override:
        return override
    return os.getenv("DATABASE_URL", "sqlite:///./health_v2.db")


def build_engine(database_url: str):
    connect_args = {}
    if database_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    return create_engine(database_url, future=True, connect_args=connect_args)


def build_session_factory(engine):
    return sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)


def get_db_session(session_factory) -> Generator[Session, None, None]:
    session = session_factory()
    try:
        yield session
    finally:
        session.close()

