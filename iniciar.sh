#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' 'Python 3 não foi encontrado. No Linux Mint, instale-o pelo gerenciador de aplicativos ou peça ajuda antes de instalar dependências.' >&2
  exit 1
fi
PORT=8765
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
sleep 1
URL="http://127.0.0.1:${PORT}/"
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 || true
fi
printf 'Glucometer está disponível em %s\nPressione Ctrl+C para encerrar.\n' "$URL"
wait "$SERVER_PID"
