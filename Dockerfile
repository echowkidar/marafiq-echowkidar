# SONU Facilities Portal: single container (Node built-in HTTP server + built-in SQLite, no npm deps)
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=5173 \
    DATA_DIR=/app/data \
    NODE_NO_WARNINGS=1

WORKDIR /app
COPY index.html app.html ./
COPY assets ./assets
COPY css ./css
COPY js ./js
COPY server ./server

RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 5173
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5173/api/health || exit 1

CMD ["node", "server/server.js"]
