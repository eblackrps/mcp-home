FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY data ./data
COPY notes ./notes
COPY src ./src
COPY scripts ./scripts

RUN npm run build

ENV PORT=8787
ENV HOMELAB_STATUS_PATH=/app/data/homelab-status.json
ENV WINDOWS_HOST_STATUS_PATH=/app/data/local/windows-host-status.json
ENV SNAPSHOT_STATUS_PATH=/app/data/local/snapshot-status.json
ENV PLEX_LIBRARY_INDEX_PATH=/app/data/local/plex-library-index.json
ENV MCP_OAUTH_STATE_PATH=/app/state/oauth-state.json
ENV NOTES_DIR=/app/notes

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '8787') + '/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "dist/index-http.js"]
