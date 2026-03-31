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
ENV NOTES_DIR=/app/notes

EXPOSE 8787

CMD ["node", "dist/index-http.js"]
