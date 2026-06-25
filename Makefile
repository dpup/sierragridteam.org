# S.I.E.R.R.A site — developer + CI entrypoints.
# `make help` lists targets. Install deps with `make install` (uses npm; bun is
# only used as a script/test runner — `bun install` hangs behind this proxy).

.DEFAULT_GOAL := help
.PHONY: help install dev build preview check lint fmt fmt-check test test-browser \
        screenshots snapshot gen-assets verify ci clean

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies (npm — proxy-safe)
	npm install --no-audit --no-fund

dev: ## Start the dev server
	npm run dev

build: ## Build the static site to dist/
	npm run build

preview: ## Preview the built site
	npm run preview

check: ## Type-check (astro check)
	npm run check

lint: ## Lint CSS/design tokens (stylelint guardrails)
	npm run lint

fmt: ## Format with prettier
	npm run fmt

fmt-check: ## Verify formatting
	npm run fmt:check

test: ## Unit tests (data layer) via bun
	bun test

test-browser: ## A11y + smoke tests (Playwright)
	npm run test:visual

screenshots: ## Capture deterministic screenshots → tests/screenshots
	npm run screenshots

snapshot: ## Refresh the checked-in info.ersn.net data snapshot
	npm run snapshot

gen-assets: ## Regenerate favicons / OG image / logo mark from the master logo
	npm run gen-assets

verify: check lint fmt-check test ## Fast pre-commit checks (no browser)

ci: check lint fmt-check test build test-browser ## Full CI pipeline

clean: ## Remove build + test artifacts
	rm -rf dist .astro test-results playwright-report
