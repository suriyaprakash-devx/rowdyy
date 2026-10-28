from datetime import datetime, timezone
import uuid
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from backend.database import Base

def utcnow():
    return datetime.now(timezone.utc)

class OAuthSession(Base):
    __tablename__ = "oauth_sessions"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(100), nullable=False, index=True)
    user_name = Column(String(200), nullable=True)
    email = Column(String(200), nullable=True)
    encrypted_access_token = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True)

class ScanRun(Base):
    __tablename__ = "scan_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    started_at = Column(DateTime, default=utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    stocks_scanned = Column(Integer, default=0, nullable=False)
    signals_found = Column(Integer, default=0, nullable=False)
    status = Column(String(50), default="running", nullable=False)  # running, completed, failed
    error_message = Column(Text, nullable=True)

    results = relationship("ScanResult", back_populates="scan_run", cascade="all, delete-orphan", order_by="ScanResult.rank")

class ScanResult(Base):
    __tablename__ = "scan_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    scan_id = Column(Integer, ForeignKey("scan_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    rank = Column(Integer, nullable=False)
    symbol = Column(String(50), nullable=False, index=True)
    company = Column(String(250), nullable=False)
    signal_type = Column(String(50), nullable=False)  # BUY / SELL / WATCH / UNCONFIRMED
    crossover_date = Column(String(50), nullable=False)  # Timestamp or date
    close = Column(Float, nullable=False)
    sma6 = Column(Float, nullable=False)
    sma30 = Column(Float, nullable=False)
    rel_volume = Column(Float, default=1.0, nullable=True)
    change_pct = Column(Float, default=0.0, nullable=True)
    cumulative_volume = Column(Integer, default=0, nullable=True)
    traded_value = Column(Float, default=0.0, nullable=True)
    signal_score = Column(Float, default=0.0, nullable=True)
    is_confirmed = Column(Boolean, default=False, nullable=False)
    confirmation_notes = Column(Text, nullable=True)
    status = Column(String(20), default="WATCH", nullable=False)
    candle_timestamp = Column(String(50), nullable=True)
    freshness = Column(String(20), default="ACTIVE", nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    scan_run = relationship("ScanRun", back_populates="results")

def cleanup_old_scans(db, keep_count: int = 1, delete_all: bool = False):
    """
    Cleans up old scan runs and related results based on retention policy.
    - If delete_all=True: deletes all completed/failed scans.
    - If keep_count=1: keeps the latest scan, deletes older ones.
    """
    if delete_all:
        db.query(ScanRun).delete()
        db.commit()
        return

    # Find IDs of scans to keep
    keep_ids = [
        r[0] for r in db.query(ScanRun.id)
        .order_by(ScanRun.id.desc())
        .limit(keep_count)
        .all()
    ]
    if keep_ids:
        # Delete scan runs older than the kept ones
        db.query(ScanRun).filter(~ScanRun.id.in_(keep_ids)).delete(synchronize_session=False)
        db.commit()
