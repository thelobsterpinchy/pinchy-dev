#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[pinchy] npm install"
npm install

echo "[pinchy] tsc --noEmit"
npm run check

echo "[pinchy] tests"
npm test

echo "[pinchy] done"
