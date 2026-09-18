FROM node:22-bookworm-slim AS bridge-build
WORKDIR /bridge

# Render builds from the repository root, while this Dockerfile lives in
# neko-render-backend-console-info/neko-render-backend/.
COPY neko-render-backend-console-info/neko-render-backend/bridge/package.json ./package.json
RUN npm install --omit=dev
COPY neko-render-backend-console-info/neko-render-backend/bridge/server.js ./server.js

FROM ghcr.io/m1k1o/neko/firefox:latest
USER root
COPY --from=bridge-build /usr/local/bin/node /usr/local/bin/node
COPY --from=bridge-build /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=bridge-build /bridge /opt/render-bridge
COPY neko-render-backend-console-info/neko-render-backend/render-entrypoint.sh /usr/local/bin/render-entrypoint.sh
RUN chmod +x /usr/local/bin/render-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/render-entrypoint.sh"]
