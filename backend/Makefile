.PHONY: generate fmt test test-integration lint compose-up compose-down migrate seed-admin

GO_IMAGE := golang@sha256:e8c859f5632dcfde7b32d2012b4351728f6437930887c2f6a91ea242459e5514
GO_RUN := docker run --rm -v $(CURDIR):/src -w /src -e GOCACHE=/tmp/go-cache -e GOMODCACHE=/tmp/go-mod-cache $(GO_IMAGE)
ROOT_COMPOSE := docker compose -f ../compose.yaml
INTEGRATION_ENV := COMPOSE_PROJECT_NAME=wordweave POSTGRES_PASSWORD=postgres PUBLIC_ORIGIN=http://localhost:3000 APP_DATABASE_URL=postgres://postgres:postgres@postgres:5432/wordweave?sslmode=disable AI_DATABASE_URL=postgres://postgres:postgres@postgres:5432/wordweave?sslmode=disable SESSION_PEPPER=local-session-pepper-change-before-production-0001 CAPABILITY_PEPPER=local-capability-pepper-change-before-production-0001 CSRF_HMAC_KEY=local-csrf-hmac-key-change-before-production-0000001 CURSOR_HMAC_KEY=local-cursor-hmac-key-change-before-production-0001 OPENROUTER_MASTER_KEYS=1:bG9jYWwtd29yZHdlYXZlLW1hc3Rlci1rZXktMDAwMXg= OPENROUTER_CURRENT_KEY_VERSION=1 COOKIE_SECURE=false
INTEGRATION_MOD_CACHE := wordweave-go-mod-cache

generate:
	$(GO_RUN) go run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.31.1 generate

fmt:
	$(GO_RUN) sh -c 'gofmt -w $$(find . -name "*.go" -not -path "./internal/dbgen/*")'

test:
	$(GO_RUN) go test -race ./...

test-integration:
	docker volume create $(INTEGRATION_MOD_CACHE) >/dev/null
	docker run --rm -v $(CURDIR):/src -w /src -v $(INTEGRATION_MOD_CACHE):/go/pkg/mod $(GO_IMAGE) go mod download
	$(INTEGRATION_ENV) $(ROOT_COMPOSE) up -d postgres
	$(INTEGRATION_ENV) $(ROOT_COMPOSE) run --rm migrate
	docker run --rm -v $(CURDIR):/src -w /src -e GOCACHE=/tmp/go-cache -e GOMODCACHE=/go/pkg/mod \
		-v $(INTEGRATION_MOD_CACHE):/go/pkg/mod \
		--network wordweave_data \
		-e TEST_DATABASE_URL='postgres://postgres:postgres@postgres:5432/wordweave?sslmode=disable' \
		$(GO_IMAGE) go test -race -tags=integration ./...

lint:
	$(GO_RUN) go vet ./...

compose-up:
	$(ROOT_COMPOSE) --env-file .env up --build

compose-down:
	$(ROOT_COMPOSE) down

migrate:
	$(ROOT_COMPOSE) --env-file .env run --rm migrate

seed-admin:
	$(ROOT_COMPOSE) --env-file .env run --rm --entrypoint /usr/local/bin/wordweave-admin \
		-e ADMIN_USERNAME -e ADMIN_PASSWORD backend create-admin
