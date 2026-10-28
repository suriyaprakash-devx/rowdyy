import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple
import httpx
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from backend.config import settings, get_fernet_cipher, reload_settings
from backend.database import get_db
from backend.models import OAuthSession

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Authentication"])

UPSTOX_USER_PROFILE_URL = "https://api.upstox.com/v2/user/profile"
UPSTOX_LOGOUT_URL = "https://api.upstox.com/v2/logout"

SESSION_COOKIE_NAME = "upstox_session_id"

def is_expired(dt: Optional[datetime]) -> bool:
    if not dt:
        return False
    if dt.tzinfo is not None:
        return dt < datetime.now(timezone.utc)
    return dt < datetime.now(timezone.utc).replace(tzinfo=None)

def is_valid_future(dt: Optional[datetime]) -> bool:
    if not dt:
        return False
    if dt.tzinfo is not None:
        return dt > datetime.now(timezone.utc)
    return dt > datetime.now(timezone.utc).replace(tzinfo=None)

def encrypt_token(plain_token: str) -> str:
    cipher = get_fernet_cipher()
    return cipher.encrypt(plain_token.encode()).decode()

def decrypt_token(encrypted_token: str) -> str:
    cipher = get_fernet_cipher()
    return cipher.decrypt(encrypted_token.encode()).decode()

def get_session_id_from_request(request: Request) -> Optional[str]:
    # 1. Check HTTP-only cookie
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    if session_id:
        return session_id
    # 2. Check X-Session-ID header
    session_id = request.headers.get("X-Session-ID")
    if session_id:
        return session_id
    # 3. Check Authorization Bearer header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.split(" ")[1]
    return None

def get_current_session(
    request: Request,
    db: Session = Depends(get_db)
) -> OAuthSession:
    session_id = get_session_id_from_request(request)
    if not session_id:
        # Also check query param if testing
        session_id = request.query_params.get("session_id")

    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide your Upstox access token."
        )

    session = db.query(OAuthSession).filter(
        OAuthSession.id == session_id,
        OAuthSession.is_active == True
    ).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session not found or inactive. Please login with your Upstox access token."
        )

    # Check if expired
    if is_expired(session.expires_at):
        session.is_active = False
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Upstox authentication expired. Please reconnect your Upstox account."
        )

    return session

def get_current_session_optional(
    request: Request,
    db: Session = Depends(get_db)
) -> Optional[OAuthSession]:
    try:
        return get_current_session(request, db)
    except HTTPException:
        return None

def get_active_access_token(session: OAuthSession) -> str:
    try:
        return decrypt_token(session.encrypted_access_token)
    except Exception as e:
        logger.error(f"Failed to decrypt Upstox access token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Failed to decrypt token. Please reconnect your Upstox account."
        )

class DirectTokenInput(BaseModel):
    access_token: str

@router.post("/token")
async def save_direct_token(
    payload: DirectTokenInput,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Allows user to provide their Upstox access token directly from the UI.
    Verifies the token with Upstox API, extracts user profile, encrypts the token,
    and sets an active authenticated session.
    """
    raw_token = payload.access_token.strip()
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Access token cannot be empty."
        )

    # Clean token if user accidentally pasted 'Bearer ' prefix
    if raw_token.lower().startswith("bearer "):
        raw_token = raw_token[7:].strip()

    # Verify token with official Upstox user profile endpoint
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                UPSTOX_USER_PROFILE_URL,
                headers={"Authorization": f"Bearer {raw_token}", "accept": "application/json"}
            )
            if resp.status_code != 200:
                logger.warning(f"Upstox direct token verification failed ({resp.status_code}): {resp.text}")
                detail_msg = "Invalid or expired Upstox access token."
                try:
                    err_json = resp.json()
                    errors = err_json.get("errors", [])
                    if errors and "message" in errors[0]:
                        detail_msg += f" Upstox error: {errors[0]['message']}"
                except Exception:
                    pass
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=detail_msg
                )
            profile_data = resp.json().get("data", {})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error connecting to Upstox API for token verification: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to verify token with Upstox API: {str(e)}"
        )

    user_id = profile_data.get("user_id") or "UPSTOX_USER"
    user_name = profile_data.get("user_name") or "Upstox User"
    email = profile_data.get("email") or ""

    # Encrypt access token before storing in database
    encrypted_token = encrypt_token(raw_token)

    # Invalidate previous active sessions for this specific user
    db.query(OAuthSession).filter(
        OAuthSession.user_id == user_id,
        OAuthSession.is_active == True
    ).update({"is_active": False})

    # Set expiry to 24 hours from now
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    new_session = OAuthSession(
        user_id=user_id,
        user_name=user_name,
        email=email,
        encrypted_access_token=encrypted_token,
        is_active=True,
        expires_at=expires_at
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    # Set secure HTTP-only cookie
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=new_session.id,
        max_age=86400,
        httponly=True,
        samesite="lax",
        secure=settings.DATABASE_URL.startswith("postgresql")
    )

    return {
        "authenticated": True,
        "session_id": new_session.id,
        "user_id": user_id,
        "user_name": user_name,
        "email": email,
        "message": f"Connected to Upstox successfully as {user_name} ({user_id})!"
    }

@router.get("/status")
async def auth_status(request: Request, db: Session = Depends(get_db)):
    """
    Checks if a valid Upstox session exists and verifies it against Upstox profile endpoint.
    Never returns the raw access token.
    """
    session = None
    try:
        session = get_current_session(request, db)
    except HTTPException:
        pass

    if session:
        # Verify token validity with Upstox API
        try:
            token = get_active_access_token(session)
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(
                    UPSTOX_USER_PROFILE_URL,
                    headers={"Authorization": f"Bearer {token}", "accept": "application/json"}
                )
                if resp.status_code == 200:
                    profile_data = resp.json().get("data", {})
                    return {
                        "authenticated": True,
                        "configured": True,
                        "session_id": session.id,
                        "user_id": profile_data.get("user_id") or session.user_id,
                        "user_name": profile_data.get("user_name") or session.user_name,
                        "email": profile_data.get("email") or session.email,
                        "broker": profile_data.get("broker", "UPSTOX"),
                        "expires_at": session.expires_at.isoformat() if session.expires_at else None
                    }
                else:
                    session.is_active = False
                    db.commit()
        except Exception as e:
            logger.warning(f"Error checking Upstox profile: {e}")
            if is_valid_future(session.expires_at):
                return {
                    "authenticated": True,
                    "configured": True,
                    "session_id": session.id,
                    "user_id": session.user_id,
                    "user_name": session.user_name,
                    "email": session.email,
                    "expires_at": session.expires_at.isoformat()
                }

    current_settings = settings
    if not current_settings.UPSTOX_CLIENT_ID or current_settings.UPSTOX_CLIENT_ID.startswith("paste_"):
        current_settings = reload_settings()

    oauth_configured = bool(
        current_settings.UPSTOX_CLIENT_ID and 
        not current_settings.UPSTOX_CLIENT_ID.startswith("paste_") and 
        current_settings.UPSTOX_CLIENT_SECRET and 
        not current_settings.UPSTOX_CLIENT_SECRET.startswith("paste_")
    )
    return {
        "authenticated": False,
        "configured": oauth_configured,
        "message": "Not authenticated. Paste your Upstox access token or connect via OAuth."
    }

@router.post("/logout")
async def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Logs out the current session, calls Upstox logout API, and clears the session cookie.
    """
    try:
        session = get_current_session(request, db)
        token = get_active_access_token(session)
        # Attempt Upstox API logout
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.delete(
                    UPSTOX_LOGOUT_URL,
                    headers={"Authorization": f"Bearer {token}", "accept": "application/json"}
                )
        except Exception:
            pass

        session.is_active = False
        db.commit()
    except HTTPException:
        pass

    response.delete_cookie(key=SESSION_COOKIE_NAME)
    return {"status": "success", "message": "Logged out successfully."}
