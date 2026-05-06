#!/usr/bin/env bash
set -euo pipefail

PINCHY_PREFIX="${PINCHY_PREFIX:-$HOME/.pinchy}"
PINCHY_PACKAGE="${PINCHY_INSTALL_PACKAGE:-pinchy-dev@latest}"
PINCHY_BIN_DIR="$PINCHY_PREFIX/bin"
UPDATE_SHELL=0
RUN_DOCTOR=1
DRY_RUN=0

usage() {
  cat <<'EOF'
Pinchy installer

Usage:
  install.sh [options]

Options:
  --prefix <path>       Install Pinchy under this local prefix. Default: ~/.pinchy
  --package <spec>      npm package spec to install. Default: pinchy-dev@latest
  --update-shell        Append the Pinchy bin directory to your shell startup file when needed.
  --no-doctor           Skip the post-install `pinchy doctor` check.
  --dry-run             Print actions without running npm or editing shell files.
  -h, --help            Show this help.

Environment:
  PINCHY_PREFIX          Local install prefix.
  PINCHY_INSTALL_PACKAGE npm package spec.
EOF
}

log() {
  printf '[pinchy-install] %s\n' "$*"
}

run() {
  log "$*"
  if [ "$DRY_RUN" -eq 0 ]; then
    "$@"
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --prefix)
      PINCHY_PREFIX="${2:?missing value for --prefix}"
      PINCHY_BIN_DIR="$PINCHY_PREFIX/bin"
      shift 2
      ;;
    --package)
      PINCHY_PACKAGE="${2:?missing value for --package}"
      shift 2
      ;;
    --update-shell)
      UPDATE_SHELL=1
      shift
      ;;
    --no-doctor)
      RUN_DOCTOR=0
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  log "Node.js is required. Install Node 22.14+ or Node 24, then rerun this installer."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  log "npm is required but was not found on PATH."
  exit 1
fi

log "Installing $PINCHY_PACKAGE into $PINCHY_PREFIX"
run mkdir -p "$PINCHY_PREFIX"
run npm install --global --prefix "$PINCHY_PREFIX" "$PINCHY_PACKAGE"

PINCHY_CLI="$PINCHY_BIN_DIR/pinchy"
if [ "$DRY_RUN" -eq 0 ] && [ ! -x "$PINCHY_CLI" ]; then
  log "Expected Pinchy CLI was not created: $PINCHY_CLI"
  exit 1
fi

case ":$PATH:" in
  *":$PINCHY_BIN_DIR:"*)
    log "Pinchy bin directory is already on PATH: $PINCHY_BIN_DIR"
    ;;
  *)
    SHELL_RC="${HOME}/.profile"
    case "${SHELL:-}" in
      */zsh) SHELL_RC="${HOME}/.zshrc" ;;
      */bash) SHELL_RC="${HOME}/.bashrc" ;;
    esac
    PATH_LINE="export PATH=\"$PINCHY_BIN_DIR:\$PATH\""
    log "Pinchy installed, but your shell may not find the pinchy command yet."
    log "For this terminal: export PATH=\"$PINCHY_BIN_DIR:\$PATH\""
    log "To persist it: add this line to $SHELL_RC:"
    log "$PATH_LINE"
    if [ "$UPDATE_SHELL" -eq 1 ]; then
      if [ "$DRY_RUN" -eq 0 ]; then
        touch "$SHELL_RC"
        if ! grep -F "$PINCHY_BIN_DIR" "$SHELL_RC" >/dev/null 2>&1; then
          printf '\n# Pinchy CLI\n%s\n' "$PATH_LINE" >> "$SHELL_RC"
        fi
      fi
      log "Updated shell startup file: $SHELL_RC"
    fi
    ;;
esac

if [ "$DRY_RUN" -eq 0 ]; then
  "$PINCHY_CLI" version || "$PINCHY_CLI" help
  if [ "$RUN_DOCTOR" -eq 1 ]; then
    log "Running pinchy doctor in the current directory."
    "$PINCHY_CLI" doctor || true
  fi
fi

log "Install complete. Next steps:"
log "  export PATH=\"$PINCHY_BIN_DIR:\$PATH\""
log "  cd /path/to/your/repo"
log "  pinchy init"
log "  pinchy setup"
log "  pinchy up"
