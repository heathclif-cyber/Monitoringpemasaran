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

# SQLAlchemy requires 'postgresql://' instead of 'postgres://'
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Auto-detect PostgreSQL driver: psycopg2 > psycopg3 > SQLite fallback
try:
    import psycopg2  # noqa: F401
    PG_DRIVER = "psycopg2"
    logger.info("Using psycopg2 driver for PostgreSQL")
except ImportError:
    try:
        import psycopg  # noqa: F401
        PG_DRIVER = "psycopg"
        logger.info("Using psycopg (v3) driver for PostgreSQL")
    except ImportError:
        PG_DRIVER = None
        logger.info("No PostgreSQL driver found, falling back to SQLite")

def _clean_db_url(url: str) -> str:
    """
    Remove query parameters not supported by PostgreSQL drivers,
    e.g. ?pgbouncer=true added by connection pooler URLs (Railway, etc).
    """
    parsed = urlparse(url)
    if not parsed.query:
        return url
    UNSUPPORTED = {"pgbouncer", "sslmode", "application_name"}
    kept = {k: v for k, v in parse_qs(parsed.query).items() if k not in UNSUPPORTED}
    clean_query = urlencode(kept, doseq=True)
    cleaned = urlunparse(parsed._replace(query=clean_query))
    if cleaned != url:
        logger.info("Stripped unsupported query params from DATABASE_URL")
    return cleaned

# Only SQLite needs the check_same_thread argument
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
    logger.info("Using SQLite database")
elif not PG_DRIVER:
    logger.warning("No PostgreSQL driver available, falling back to SQLite")
    engine = create_engine(
        "sqlite:///./blueprint.db",
        connect_args={"check_same_thread": False}
    )
else:
    clean_url = _clean_db_url(SQLALCHEMY_DATABASE_URL)
    # Use psycopg3 driver prefix if psycopg2 not available
    if PG_DRIVER == "psycopg" and not clean_url.startswith("postgresql+psycopg"):
        clean_url = clean_url.replace("postgresql://", "postgresql+psycopg://", 1)
    engine = create_engine(
        clean_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        pool_timeout=10,
        connect_args={"connect_timeout": 10}
    )
    logger.info("Using PostgreSQL database (Railway)")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
