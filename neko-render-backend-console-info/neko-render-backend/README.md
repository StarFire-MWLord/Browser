# Render backend for the supplied Lovable Neko frontend

This project wraps the official `ghcr.io/m1k1o/neko/firefox:latest` image with a tiny WebSocket compatibility bridge. The bridge listens on Render's `$PORT`, accepts both `/api/ws` and `/ws`, preserves the `password` and `usr` query parameters used by the supplied Lovable project, and proxies signalling to Neko's legacy-compatible local WebSocket.

## Important: Render + WebRTC

Render web services publicly expose HTTP/HTTPS/WebSocket traffic through one port, but Neko normally needs separate raw UDP/TCP WebRTC media ports. For a Render deployment, configure a **public TURN relay**. The included startup script injects the same TURN server into both Neko's backend ICE agent and the browser ICE configuration.

Use a TURN provider/server that gives you long-term credentials and preferably supports TURN/TLS or TURN/TCP on port 443.

## Render deployment

1. Put these files in a Git repository.
2. In Render, create a **Web Service** from the repository and choose the Docker runtime. You can also use the included `render.yaml` Blueprint.
3. Use a paid instance with enough RAM/CPU for Firefox + video encoding. Neko is much heavier than a normal API service.
4. Set these environment variables in Render:

   - `NEKO_MEMBER_MULTIUSER_USER_PASSWORD` — password viewers type in your Lovable UI.
   - `NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD` — separate strong admin password.
   - `NEKO_DESKTOP_SCREEN` — optional; default `1280x720@30`.
   - `TURN_URLS` — comma-separated TURN URLs, for example `turns:turn.example.com:443?transport=tcp,turn:turn.example.com:443?transport=tcp`.
   - `TURN_USERNAME` — TURN username.
   - `TURN_CREDENTIAL` — TURN credential/password.

Do **not** manually set `PORT`. Render supplies it automatically and the bridge binds to it.

## Values to enter in the existing Lovable connection panel

After Render deploys successfully and gives you a URL such as `https://my-neko.onrender.com`:

- **Host or IP:** `my-neko.onrender.com` (hostname only; no `https://` is safest with the supplied URL builder)
- **Port:** leave blank
- **TLS / secure:** ON
- **Username:** any display name
- **Password:** exactly the value of `NEKO_MEMBER_MULTIUSER_USER_PASSWORD`

Why blank port? Render terminates HTTPS/WSS on the normal public TLS port and forwards it internally to `$PORT`. The `$PORT` value (often 10000) is an internal service port and is not the public port you should type into the Lovable app.

## Health check

Open `https://YOUR-SERVICE.onrender.com/health`. Expected response:

```json
{"ok":true,"service":"neko-render-bridge"}
```

## Notes

- The bridge intentionally exposes only the health endpoint plus WebSockets; Neko's built-in UI stays private on localhost.
- If signalling connects but video remains black, verify the TURN credentials first. A public STUN server alone does not replace the missing raw media ports on Render.
- Keep TURN credentials private. They are backend environment variables; the Neko signalling protocol necessarily sends ICE server credentials to authenticated WebRTC clients so their browsers can use the relay.
