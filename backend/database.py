import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from backend.config import settings

logger = logging.getLogger(__name__)

# Engine configuration
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
else:
    connect_args = {"sslmode": "require"} if "render.com" in settings.DATABASE_URL else {}

try:
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args=connect_args,
        pool_pre_ping=True
    )
except Exception as e:
    logger.error(f"Failed to initialize database engine with URL {settings.DATABASE_URL}: {e}")
    # Fallback to local SQLite if PostgreSQL connection fails
    logger.warning("Falling back to local SQLite engine (scanner.db)")
    engine = create_engine("sqlite:///./scanner.db", connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    global engine, SessionLocal
    import backend.models  # noqa: F401
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        logger.error(f"Database initialization error on URL: {e}. Falling back to SQLite scanner.db.")
        engine = create_engine("sqlite:///./data/scanner.db", connect_args={"check_same_thread": False})
        SessionLocal.configure(bind=engine)
        Base.metadata.create_all(bind=engine)
    
    # Safe migration: ensure new columns exist in scan_results
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            # Query existing columns
            cols = []
            if settings.DATABASE_URL.startswith("sqlite"):
                cursor = conn.execute(text("PRAGMA table_info(scan_results)"))
                cols = [row[1] for row in cursor.fetchall()]
            else:
                cursor = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='scan_results'"))
                cols = [row[0] for row in cursor.fetchall()]
            
            if cols:
                needed = {
                    "rel_volume": "FLOAT DEFAULT 1.0",
                    "change_pct": "FLOAT DEFAULT 0.0",
                    "cumulative_volume": "INTEGER DEFAULT 0",
                    "traded_value": "FLOAT DEFAULT 0.0",
                    "signal_score": "FLOAT DEFAULT 0.0",
                    "is_confirmed": "BOOLEAN DEFAULT FALSE",
                    "confirmation_notes": "TEXT",
                    "status": "VARCHAR(20) DEFAULT 'WATCH'",
                    "candle_timestamp": "VARCHAR(50)",
                    "freshness": "VARCHAR(20) DEFAULT 'ACTIVE'"
                }
                for col_name, col_type in needed.items():
                    if col_name not in cols:
                        logger.info(f"Adding missing column {col_name} to scan_results...")
                        conn.execute(text(f"ALTER TABLE scan_results ADD COLUMN {col_name} {col_type}"))
    except Exception as e:
        logger.warning(f"Database column verification note: {e}")

    logger.info("Database tables initialized successfully.")
