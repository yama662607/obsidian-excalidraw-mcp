# =============================================================================
# Configuration & Variables
# =============================================================================

set dotenv-load := true
set shell := ["bash", "-c"]

# Package manager
pm := "npm"

# =============================================================================
# Standard Interface (AI Agent Protocol)
# =============================================================================

# Default: Run read-only quality check
default: check

# Setup: Install dependencies, setup toolchain
setup:
	@echo "Setting up environment..."
	{{pm}} install
	@echo "Setup complete! Run 'just check' to verify."

# Quality gate: Read-only verification (CI compatible)
check: fmt-check lint typecheck test
	@echo "All quality checks passed!"

# Auto-fix: Apply format and lint fixes
fix: fmt lint-fix
	@echo "Auto-fixes applied!"

# =============================================================================
# Testing & Verification
# =============================================================================

# Unit/integration tests with argument pass-through
test *args="":
	@echo "Running tests..."
	{{pm}} run test {{args}}

# Watch mode for tests
test-watch:
	@echo "Running tests in watch mode..."
	{{pm}} run test:watch

# =============================================================================
# Granular Tasks (Components of 'check' & 'fix')
# =============================================================================

# --- Format ---

fmt-check:
	@echo "Checking formatting..."
	{{pm}} exec -- biome check --formatter-enabled=true --linter-enabled=false .

fmt:
	@echo "Formatting code..."
	{{pm}} exec -- biome format --write .

# --- Lint ---

lint:
	@echo "Linting..."
	{{pm}} exec -- biome check .

lint-fix:
	@echo "Fixing lint errors..."
	{{pm}} exec -- biome check --write .

# --- Typecheck ---

typecheck:
	@echo "Checking types..."
	{{pm}} run lint

# =============================================================================
# Operations & Utilities
# =============================================================================

# Start development server (watch mode)
dev:
	@echo "Starting dev server..."
	{{pm}} run dev

# Production build
build:
	@echo "Building artifact..."
	{{pm}} run build

# Remove build artifacts
clean:
	@echo "Cleaning artifacts..."
	rm -rf node_modules/.cache dist

# =============================================================================
# Dependency Management
# =============================================================================

# Safety check: Ensure git working tree is clean
ensure-clean:
	@if [ -n "$(git status --porcelain)" ]; then \
		echo "Error: Working directory is dirty."; \
		echo "Please commit or stash changes before upgrading."; \
		exit 1; \
	fi

# Upgrade all packages (flow: git check -> baseline check -> update -> verify)
upgrade: ensure-clean check
	@echo "Baseline passed. Current code is stable."
	@echo "Starting full upgrade process..."
	{{pm}} update
	@echo "Verifying upgrade stability..."
	just check
	@echo "Upgrade complete!"
