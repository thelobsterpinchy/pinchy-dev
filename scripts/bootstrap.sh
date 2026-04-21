#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Bootstrapping pinchy-dev"
echo "Installing npm dependencies..."
npm install

echo "Installing Playwright Chromium for browser debugging tools..."
npm run playwright:install

echo
cat <<'EOF'
Next steps:
1. export PINCHY_OLLAMA_ENABLED=1 or PINCHY_LMSTUDIO_ENABLED=1
2. optionally set PINCHY_OLLAMA_MODELS / PINCHY_LMSTUDIO_MODELS
3. run: npm run agent
4. for long-running mode, run: npm run daemon
5. if browser tools ever stop working after a Playwright upgrade, rerun: npm run playwright:install
EOF
