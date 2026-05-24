# Multi-stage build:
#   1. engine        — compile Rust binaries
#   2. web           — build the Vite SPA bundle
#   3. server-build  — compile TypeScript to JS (tsc)
#   4. runtime       — minimal Node + binaries + static web + compiled server

# ----- stage 1: Rust engine -----------------------------------------------
FROM rust:1.83-slim AS engine
WORKDIR /work
COPY engine/Cargo.toml ./engine/Cargo.toml
COPY engine/src ./engine/src
COPY engine/examples ./engine/examples
RUN cd engine && cargo build --release --bins

# ----- stage 2: Web bundle -------------------------------------------------
FROM node:22-slim AS web
WORKDIR /work
COPY web/package.json web/package-lock.json* ./web/
RUN cd web && npm install --include=dev
COPY web ./web
RUN cd web && npm run build

# ----- stage 3: Server build ----------------------------------------------
FROM node:22-slim AS server-build
WORKDIR /work
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --include=dev
COPY server ./server
RUN cd server && npm run build

# ----- stage 4: Server runtime --------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production deps only — no tsx, no typescript, no @types/*.
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

# Compiled JS from the server-build stage.
COPY --from=server-build /work/server/dist /app/server/dist

# Rust binaries
COPY --from=engine /work/engine/target/release/stillgrid-solve /app/engine/target/release/stillgrid-solve
COPY --from=engine /work/engine/target/release/stillgrid-generate /app/engine/target/release/stillgrid-generate
COPY --from=engine /work/engine/target/release/stillgrid-grade /app/engine/target/release/stillgrid-grade

# Web SPA bundle
COPY --from=web /work/web/dist /app/web/dist

EXPOSE 3001
CMD ["node", "server/dist/index.js"]
