# Thin wrapper: the real commands are pnpm scripts (no make on every machine).
.PHONY: check test web web-check schema
check: ; pnpm check
test: ; pnpm test
schema: ; pnpm schema
web: ; pnpm web
web-check: ; pnpm web-check
