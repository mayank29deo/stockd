#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Nubra session token refresh — run once every ~24h
# Usage: bash refresh_nubra.sh
# ─────────────────────────────────────────────────────────────

set -e

ENV_FILE="$(dirname "$0")/.env"

EMAIL="mayank29deo@gmail.com"
PHONE="7004369269"
MPIN="2002"
DEVICE_ID="stockd-server-01"

echo ""
echo "🔄 Nubra token refresh starting..."
echo ""

# ── Step 1: Request OTP ───────────────────────────────────────
echo "→ Step 1: Requesting OTP to +91$PHONE..."

OTP_RESP=$(curl -s -X POST "https://api.nubra.io/user/sendOtp" \
  -H "Content-Type: application/json" \
  -d "{\"emailId\":\"$EMAIL\",\"mobileNumber\":\"$PHONE\",\"deviceId\":\"$DEVICE_ID\"}")

echo "  Response: $OTP_RESP"
echo ""

# ── Step 2: Enter OTP ─────────────────────────────────────────
read -p "→ Step 2: Enter OTP received on +91$PHONE: " OTP

# ── Step 3: Verify OTP → auth_token ──────────────────────────
echo ""
echo "→ Step 3: Verifying OTP..."

AUTH_RESP=$(curl -s -X POST "https://api.nubra.io/user/verifyOtp" \
  -H "Content-Type: application/json" \
  -d "{\"emailId\":\"$EMAIL\",\"mobileNumber\":\"$PHONE\",\"otp\":\"$OTP\",\"deviceId\":\"$DEVICE_ID\"}")

echo "  Response: $AUTH_RESP"

AUTH_TOKEN=$(echo "$AUTH_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('auth_token',''))" 2>/dev/null)

if [ -z "$AUTH_TOKEN" ]; then
  echo ""
  echo "❌ Failed to get auth_token. Check OTP and try again."
  exit 1
fi

echo "  ✅ auth_token obtained"

# ── Step 4: Verify MPIN → session_token ──────────────────────
echo ""
echo "→ Step 4: Verifying MPIN..."

SESSION_RESP=$(curl -s -X POST "https://api.nubra.io/user/verifyPin" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "x-device-id: $DEVICE_ID" \
  -d "{\"pin\":\"$MPIN\"}")

echo "  Response: $SESSION_RESP"

SESSION_TOKEN=$(echo "$SESSION_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_token',''))" 2>/dev/null)

if [ -z "$SESSION_TOKEN" ]; then
  echo ""
  echo "❌ Failed to get session_token. Check MPIN."
  exit 1
fi

echo "  ✅ session_token obtained"

# ── Update .env ───────────────────────────────────────────────
echo ""
echo "→ Updating .env..."

if grep -q "^NUBRA_SESSION_TOKEN=" "$ENV_FILE"; then
  # Replace existing line
  sed -i.bak "s|^NUBRA_SESSION_TOKEN=.*|NUBRA_SESSION_TOKEN=$SESSION_TOKEN|" "$ENV_FILE"
  rm -f "$ENV_FILE.bak"
else
  echo "NUBRA_SESSION_TOKEN=$SESSION_TOKEN" >> "$ENV_FILE"
fi

echo "  ✅ .env updated"
echo ""
echo "✅ Done! Restart the server to pick up the new token:"
echo "   cd stocksage-api && venv/bin/uvicorn main:app --port 8000"
echo ""
