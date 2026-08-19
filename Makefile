.PHONY: dev install build test lint clean engine engine-test web verify

install:
	cd engine && cargo fetch
	rustup target add wasm32-unknown-unknown
	cd web && npm install

# Native binaries. Used by the tests and by the build-time daily prerender.
engine:
	cd engine && cargo build --release

engine-test:
	cd engine && cargo test

# The browser engine.
wasm:
	cd web && npm run build:wasm

dev:
	@echo "Building the engine, then starting Vite..."
	@cd web && npm run build:wasm && npm run dev

# Full production build: wasm + typecheck + bundle + prerender.
# Depends on the native binaries for the prerender step.
build: engine
	cd web && npm run build

verify:
	cd web && node scripts/verify-build.mjs

test:
	cd engine && cargo test
	cd web && npm test

lint:
	cd engine && cargo clippy --all-targets -- -D warnings
	cd web && npm run lint

clean:
	cd engine && cargo clean
	rm -rf web/dist web/src/engine/*.wasm
