#!/usr/bin/env bash
set -euo pipefail

: "${NEKO_MEMBER_MULTIUSER_USER_PASSWORD:=neko}"
: "${NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD:=admin}"
: "${NEKO_DESKTOP_SCREEN:=1280x720@30}"

export NEKO_MEMBER_MULTIUSER_USER_PASSWORD
export NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD
export NEKO_DESKTOP_SCREEN
export NEKO_SERVER_BIND="127.0.0.1:8080"
export NEKO_SERVER_PROXY="true"
export NEKO_SERVER_CORS="*"
export NEKO_LEGACY="true"

# Render exposes only one public HTTP/WebSocket port. WebRTC media therefore
# needs a public TURN relay. If TURN_* is supplied, configure both Neko/Pion
# and the browser to use it and disable ICE-lite (TURN requires full ICE).
if [[ -n "${TURN_URLS:-}" ]]; then
  if [[ -z "${TURN_USERNAME:-}" || -z "${TURN_CREDENTIAL:-}" ]]; then
    echo "ERROR: TURN_URLS is set, but TURN_USERNAME or TURN_CREDENTIAL is missing." >&2
    exit 1
  fi
  ICE_JSON=$(python3 - <<'PY'
import json, os
urls=[x.strip() for x in os.environ['TURN_URLS'].split(',') if x.strip()]
print(json.dumps([{"urls": urls, "username": os.environ['TURN_USERNAME'], "credential": os.environ['TURN_CREDENTIAL']}], separators=(',',':')))
PY
)
  export NEKO_WEBRTC_ICELITE="false"
  export NEKO_WEBRTC_ICESERVERS_FRONTEND="$ICE_JSON"
  export NEKO_WEBRTC_ICESERVERS_BACKEND="$ICE_JSON"
  unset NEKO_WEBRTC_EPR NEKO_WEBRTC_UDPMUX NEKO_WEBRTC_TCPMUX NEKO_WEBRTC_NAT1TO1 || true
  echo "TURN relay configured for Render WebRTC media."
else
  echo "WARNING: TURN_URLS is not set. Signalling can work on Render, but the video/audio stream is unlikely to connect because Render does not expose Neko's raw WebRTC media ports." >&2
fi

/usr/bin/supervisord -c /etc/neko/supervisord.conf &
SUPERVISOR_PID=$!

cleanup() {
  kill -TERM "$SUPERVISOR_PID" 2>/dev/null || true
  kill -TERM "${BRIDGE_PID:-}" 2>/dev/null || true
  wait || true
}
trap cleanup TERM INT EXIT

# Wait briefly for the local Neko websocket/http service.
for _ in $(seq 1 60); do
  if (echo > /dev/tcp/127.0.0.1/8080) >/dev/null 2>&1; then break; fi
  if ! kill -0 "$SUPERVISOR_PID" 2>/dev/null; then
    echo "ERROR: Neko supervisor exited during startup." >&2
    wait "$SUPERVISOR_PID"
    exit 1
  fi
  sleep 0.5
done

/usr/local/bin/node /opt/render-bridge/server.js &
BRIDGE_PID=$!
wait -n "$SUPERVISOR_PID" "$BRIDGE_PID"
