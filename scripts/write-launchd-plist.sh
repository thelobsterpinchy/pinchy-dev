#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_PATH="${HOME}/Library/LaunchAgents/dev.pinchy.agent.plist"
NODE_PATH="$(command -v node || true)"
NPM_PATH="$(command -v npm || true)"

if [[ -z "${NODE_PATH}" || -z "${NPM_PATH}" ]]; then
  echo "node and npm must be available in PATH"
  exit 1
fi

cat > "${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>dev.pinchy.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NPM_PATH}</string>
    <string>run</string>
    <string>daemon</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${ROOT}/logs/pinchy-daemon.out.log</string>
  <key>StandardErrorPath</key>
  <string>${ROOT}/logs/pinchy-daemon.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$(dirname "${NODE_PATH}"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
EOF

echo "Wrote ${PLIST_PATH}"
echo "Load with: launchctl load -w ${PLIST_PATH}"
