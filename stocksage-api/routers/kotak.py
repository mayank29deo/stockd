"""
Kotak Neo auth + portfolio router.

Endpoints:
  POST /api/kotak/auth/init    — Start login (sends OTP to registered mobile)
  POST /api/kotak/auth/verify  — Complete 2FA with OTP
  GET  /api/kotak/status       — Auth state + health
  GET  /api/kotak/holdings     — Live portfolio holdings
  GET  /api/kotak/positions    — Intraday positions
"""

from fastapi import APIRouter, Body
import services.kotak_neo_service as kotak

router = APIRouter(prefix="/api/kotak", tags=["kotak"])


@router.post("/auth/init")
async def kotak_auth_init():
    """
    Initiate Kotak Neo login.
    Sends OTP to the mobile number configured in KOTAK_MOBILE env var.
    Call this once, then POST /api/kotak/auth/verify with the OTP.
    """
    return kotak.init_login()


@router.post("/auth/verify")
async def kotak_auth_verify(otp: str = Body(..., embed=True)):
    """
    Complete Kotak Neo 2FA.
    Body: {"otp": "123456"}
    """
    return kotak.verify_otp(otp)


@router.get("/status")
async def kotak_status():
    """Kotak Neo auth state and health."""
    return kotak.health()


@router.post("/auth/logout")
async def kotak_auth_logout():
    """Clear Kotak session and remove persisted tokens from .env."""
    return kotak.logout()


@router.get("/holdings")
async def kotak_holdings():
    """
    Live portfolio holdings from the authenticated Kotak Neo account.
    Returns [] if not authenticated — call /auth/init → /auth/verify first.
    """
    if not kotak.available():
        return {
            "error":   "Kotak Neo not authenticated",
            "action":  "POST /api/kotak/auth/init then POST /api/kotak/auth/verify",
            "state":   kotak._auth_state,
            "holdings": [],
        }
    return {"holdings": kotak.get_holdings(), "source": "kotak_neo"}


@router.get("/positions")
async def kotak_positions():
    """Intraday positions from Kotak Neo."""
    if not kotak.available():
        return {"error": "Kotak Neo not authenticated", "positions": []}
    return {"positions": kotak.get_positions(), "source": "kotak_neo"}
