import os
import secrets
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field
from cryptography.fernet import Fernet

class Settings(BaseSettings):
    # Upstox API credentials
    UPSTOX_CLIENT_ID: str = Field(default="", description="Upstox API Key / Client ID")
    UPSTOX_CLIENT_SECRET: str = Field(default="", description="Upstox API Secret / Client Secret")
    UPSTOX_REDIRECT_URI: str = Field(default="http://localhost:8000/api/auth/callback", description="OAuth Redirect URI")

    # Database
    DATABASE_URL: str = Field(default="sqlite:///./scanner.db", description="Database connection URL")

    # Security & Sessions
    SESSION_SECRET_KEY: str = Field(default="dev-secret-key-change-in-production-1234567890", description="Cookie session secret")
    ENCRYPTION_KEY: str = Field(default="", description="Fernet 32-byte urlsafe base64 key for encrypting stored access tokens")

    # CORS & Deployment
    FRONTEND_URL: str = Field(default="http://localhost:5173", description="Frontend origin for CORS")
    ALLOWED_ORIGINS: str = Field(default="http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173", description="Comma-separated allowed origins")

    ENVIRONMENT: str = Field(default="development", description="Application environment")
    DELETE_RESULTS_AFTER_SCAN: bool = Field(default=False, description="Whether to delete older scan results after retrieval")
    SCAN_CONCURRENCY: int = Field(default=20, description="Concurrent API requests for 10m historical candles")
    INCLUDE_CURRENT_DAY_CANDLE: bool = Field(default=True, description="Take current day candle into account")

    # NIFTY 500 Intraday & SMA 6/30 Strategy Settings
    MOST_ACTIVE_LIMIT: int = Field(default=500, description="Target number of stocks to scan (NIFTY 500)")
    CANDIDATE_REFRESH_SECONDS: int = Field(default=120, description="Candidate refresh interval in seconds (1-5 mins)")
    SMA_FAST_PERIOD: int = Field(default=6, description="Fast SMA period (6 completed 10-minute candles)")
    SMA_SLOW_PERIOD: int = Field(default=30, description="Slow SMA period (30 completed 10-minute candles)")
    MIN_REL_VOLUME: float = Field(default=1.5, description="Minimum relative volume multiplier for confirmation")
    MIN_TRADED_VALUE_CR: float = Field(default=5.0, description="Minimum traded value in Crores for liquidity filter")
    MAX_SPREAD_PCT: float = Field(default=0.5, description="Maximum bid-ask spread percentage")
    CANDLE_INTERVAL_MINUTES: int = Field(default=10, description="Intraday candle timeframe in minutes")

    model_config = {
        "env_file": ".env",
        "extra": "ignore"
    }

settings = Settings()

def reload_settings() -> Settings:
    global settings
    settings = Settings()
    if settings.DATABASE_URL.startswith("postgres://"):
        settings.DATABASE_URL = settings.DATABASE_URL.replace("postgres://", "postgresql://", 1)
    return settings

# Normalize PostgreSQL URL for Render (postgres:// -> postgresql://)
if settings.DATABASE_URL.startswith("postgres://"):
    settings.DATABASE_URL = settings.DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Ensure encryption key is valid Fernet key
def get_fernet_cipher() -> Fernet:
    key = settings.ENCRYPTION_KEY.strip()
    if not key:
        # Fallback deterministic key based on SESSION_SECRET_KEY if not provided in dev
        import base64
        import hashlib
        derived = hashlib.sha256(settings.SESSION_SECRET_KEY.encode()).digest()
        key = base64.urlsafe_b64encode(derived).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)

# Strategy constants aliases
MOST_ACTIVE_LIMIT = settings.MOST_ACTIVE_LIMIT
CANDIDATE_REFRESH_SECONDS = settings.CANDIDATE_REFRESH_SECONDS
SMA_FAST_PERIOD = settings.SMA_FAST_PERIOD
SMA_SLOW_PERIOD = settings.SMA_SLOW_PERIOD
MIN_REL_VOLUME = settings.MIN_REL_VOLUME
MIN_TRADED_VALUE_CR = settings.MIN_TRADED_VALUE_CR
MAX_SPREAD_PCT = settings.MAX_SPREAD_PCT
CANDLE_INTERVAL_MINUTES = settings.CANDLE_INTERVAL_MINUTES
