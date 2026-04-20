#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Bootstrapping pinchy-dev"
echo "Installing npm dependencies..."
npm install

echo
cat <<'EOF'
Next steps:
1. export PINCHY_OLLAMA_ENABLED=1 or PINCHY_LMSTUDIO_ENABLED=1
2. optionally set PINCHY_OLLAMA_MODELS / PINCHY_LMSTUDIO_MODELS
3. run: npm run agent
4. for long-running mode, run: npm run daemon
EOF
