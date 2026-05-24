# Multi-stage build:
#   1. Rust stage  — compile solver/generator/grader binaries
#   2. Web stage   — build the Vite SPA bundle
#   3. Runtime     — Node + Rust binaries + static web, served by Express

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

# ----- stage 3: Server runtime --------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Server deps (production only)
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

# Server source (we run TypeScript directly via tsx — small project, no
# tsc-build step required)
COPY server ./server
RUN cd server && npm install --include=dev tsx typescript @types/node @types/express

# Rust binaries
COPY --from=engine /work/engine/target/release/stillgrid-solve /app/engine/target/release/stillgrid-solve
COPY --from=engine /work/engine/target/release/stillgrid-generate /app/engine/target/release/stillgrid-generate
COPY --from=engine /work/engine/target/release/stillgrid-grade /app/engine/target/release/stillgrid-grade

# Web static bundle
COPY --from=web /work/web/dist /app/web/dist

EXPOSE 3001
CMD ["node", "--import=tsx", "server/src/index.ts"]
