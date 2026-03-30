from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
import os
import logging
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

logger = logging.getLogger(__name__)

# Try to load .env file if python-dotenv is available
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Get DATABASE_URL from env, fallback to SQLite if not found
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./blueprint.db")

# SQLAlchemy 1.4+ requires 'postgresql://' instead of 'postgres://'
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

def _clean_db_url(url: str) -> str:
    """
    Remove query parameters that psycopg2 does not understand,
    e.g. ?pgbouncer=true added by Supabase connection pooler URLs.
    """
    parsed = urlparse(url)
    if not parsed.query:
        return url
    # List of params that psycopg2 DOES NOT support
    UNSUPPORTED = {"pgbouncer", "sslmode", "application_name"}
    kept = {k: v for k, v in parse_qs(parsed.query).items() if k not in UNSUPPORTED}
    clean_query = urlencode(kept, doseq=True)
    cleaned = urlunparse(parsed._replace(query=clean_query))
    if cleaned != url:
        logger.info("Stripped unsupported query params from DATABASE_URL (e.g. pgbouncer)")
    return cleaned

# Only SQLite needs the check_same_thread argument
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
    logger.info("Using SQLite database")
else:
    clean_url = _clean_db_url(SQLALCHEMY_DATABASE_URL)
    engine = create_engine(
        clean_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        pool_timeout=10,
        connect_args={"connect_timeout": 10}
    )
    logger.info("Using PostgreSQL database")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
