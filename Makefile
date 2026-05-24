.PHONY: dev install build test lint clean engine server web

install:
	cd engine && cargo fetch
	cd server && npm install
	cd web && npm install

engine:
	cd engine && cargo build --release

engine-test:
	cd engine && cargo test

server:
	cd server && npm run dev

web:
	cd web && npm run dev

dev:
	@echo "Starting engine (release build), server, and web in parallel..."
	@(cd engine && cargo build --release) && \
	  (cd server && npm run dev &) && \
	  (cd web && npm run dev)

build:
	cd engine && cargo build --release
	cd server && npm run build
	cd web && npm run build

test:
	cd engine && cargo test
	cd server && npm test
	cd web && npm test

lint:
	cd engine && cargo clippy -- -D warnings
	cd server && npm run lint
	cd web && npm run lint

clean:
	cd engine && cargo clean
	rm -rf server/dist web/dist
