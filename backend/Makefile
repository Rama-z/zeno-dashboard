GO ?= /usr/local/go/bin/go

.PHONY: run build test fmt seed-learning

run:
	set -a; . ./.env; set +a; $(GO) run ./cmd/api

build:
	mkdir -p bin
	$(GO) build -trimpath -o bin/api ./cmd/api

test:
	set -a; . ./.env; set +a; TEST_DATABASE_URL="$$DATABASE_URL" GOTOOLCHAIN=local $(GO) test ./...

fmt:
	$(GO) fmt ./...

seed-learning:
	set -a; . ./.env; set +a; GOTOOLCHAIN=local $(GO) run ./cmd/seed-learning