"""
Instamojo payment router.

Endpoints:
  POST /api/payment/create-order  — create Instamojo payment request, returns pay URL
  POST /api/payment/verify        — verify payment after redirect/webhook
  GET  /api/payment/callback      — redirect landing page after Instamojo payment

.env keys needed:
  INSTAMOJO_API_KEY    — from Instamojo dashboard → API & Plugins
  INSTAMOJO_AUTH_TOKEN — from Instamojo dashboard → API & Plugins
  INSTAMOJO_ENVIRONMENT — 'prod' (default) or 'test'
  FRONTEND_URL         — your frontend URL e.g. https://www.stockd.co.in
"""

import os
import requests as req_lib
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/payment", tags=["payment"])

INSTAMOJO_API_KEY    = os.getenv("INSTAMOJO_API_KEY", "")
INSTAMOJO_AUTH_TOKEN = os.getenv("INSTAMOJO_AUTH_TOKEN", "")
INSTAMOJO_ENV        = os.getenv("INSTAMOJO_ENVIRONMENT", "prod")
FRONTEND_URL         = os.getenv("FRONTEND_URL", "https://www.stockd.co.in")

_BASE = (
    "https://test.instamojo.com/api/1.1"
    if INSTAMOJO_ENV == "test"
    else "https://api.instamojo.com/api/1.1"
)


def _headers():
    return {
        "X-Api-Key":   INSTAMOJO_API_KEY,
        "X-Auth-Token": INSTAMOJO_AUTH_TOKEN,
    }


def _configured() -> bool:
    return bool(INSTAMOJO_API_KEY and INSTAMOJO_AUTH_TOKEN)


class OrderRequest(BaseModel):
    buyer_name: str = ""
    email:      str = ""
    phone:      str = ""


class VerifyRequest(BaseModel):
    payment_request_id: str
    payment_id:         str


@router.post("/create-order")
async def create_order(req: OrderRequest):
    """
    Creates an Instamojo payment request for ₹99 Pro plan.
    Returns {pay_url, payment_request_id} — frontend redirects user to pay_url.
    """
    if not _configured():
        raise HTTPException(
            status_code=503,
            detail="Payment not configured. Set INSTAMOJO_API_KEY and INSTAMOJO_AUTH_TOKEN in .env"
        )
    try:
        resp = req_lib.post(
            f"{_BASE}/payment-requests/",
            data={
                "purpose":      "Stockd Pro Plan — ₹99/month",
                "amount":       "99",
                "buyer_name":   req.buyer_name or "Stockd User",
                "email":        req.email      or "",
                "phone":        req.phone      or "",
                "redirect_url": f"{FRONTEND_URL}/payment/success",
                "webhook":      f"{os.getenv('API_URL', 'http://localhost:8000')}/api/payment/webhook",
                "allow_repeated_payments": False,
                "send_email":   bool(req.email),
                "send_sms":     False,
            },
            headers=_headers(),
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        payment_req = data.get("payment_request", {})
        return {
            "pay_url":           payment_req.get("longurl") or payment_req.get("shorturl"),
            "payment_request_id": payment_req.get("id"),
        }
    except req_lib.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Instamojo error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/verify")
async def verify_payment(req: VerifyRequest):
    """
    Verify a payment by checking its status via Instamojo API.
    Returns {verified: bool}.
    """
    if not _configured():
        raise HTTPException(status_code=503, detail="Payment not configured")
    try:
        resp = req_lib.get(
            f"{_BASE}/payment-requests/{req.payment_request_id}/",
            headers=_headers(),
            timeout=15,
        )
        resp.raise_for_status()
        data    = resp.json()
        pr      = data.get("payment_request", {})
        payments = pr.get("payments", [])

        # Find the specific payment and check status
        for p in payments:
            if p.get("payment_id") == req.payment_id:
                if p.get("status") == "Credit":
                    return {"verified": True, "payment_id": req.payment_id}
                else:
                    return {"verified": False, "status": p.get("status")}

        return {"verified": False, "error": "Payment not found"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/callback")
async def payment_callback(
    payment_request_id: str = Query(""),
    payment_id:         str = Query(""),
    payment_status:     str = Query(""),
):
    """
    Instamojo redirects here after payment.
    Forwards to frontend with status params.
    """
    status = "success" if payment_status == "Credit" else "failed"
    return RedirectResponse(
        f"{FRONTEND_URL}/payment/success"
        f"?status={status}&payment_id={payment_id}&payment_request_id={payment_request_id}"
    )


@router.post("/webhook")
async def payment_webhook(body: dict):
    """Instamojo server-side webhook — logs payment events."""
    import logging
    logging.getLogger("payment").info(f"[Instamojo webhook] {body}")
    return {"status": "ok"}
