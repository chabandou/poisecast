#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-4173}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}/}"
SESSION="first-paint-check-${RANDOM}${RANDOM}"
SERVER_LOG="output/playwright/preview-server.log"
PW=(bunx --package @playwright/cli playwright-cli --session "$SESSION")

mkdir -p output/playwright

cleanup() {
  "${PW[@]}" close >/dev/null 2>&1 || true
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [[ ! -d dist ]]; then
  bun run build >/dev/null
fi

bun run preview --host 127.0.0.1 --port "$PORT" --strictPort >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 120); do
  if curl -sf "$BASE_URL" >/dev/null; then
    break
  fi
  sleep 0.25
done

if ! curl -sf "$BASE_URL" >/dev/null; then
  echo "Preview server failed to start at $BASE_URL" >&2
  exit 1
fi

"${PW[@]}" open about:blank --browser firefox >/dev/null
"${PW[@]}" run-code "async (page) => { await page.route('**/*.css', (route) => route.abort()); }" >/dev/null
"${PW[@]}" goto "$BASE_URL" >/dev/null
"${PW[@]}" run-code "async (page) => { const bg = await page.evaluate(() => (document.body ? getComputedStyle(document.body).backgroundColor : 'no-body')); if (bg !== 'rgb(18, 18, 18)') throw new Error('Expected body background rgb(18, 18, 18), got ' + bg); await page.screenshot({ path: 'output/playwright/first-paint-no-css.png', fullPage: true }); }"
"${PW[@]}" run-code "async (page) => { await page.unroute('**/*.css'); await page.reload(); await page.waitForSelector('.pcApp'); await page.screenshot({ path: 'output/playwright/first-paint-normal.png', fullPage: true }); await page.waitForFunction(() => document.documentElement.classList.contains('pcBootComplete'), { timeout: 4500 }).catch(() => undefined); await page.screenshot({ path: 'output/playwright/first-paint-boot-complete.png', fullPage: true }); }"

echo "First-paint visual check passed: $BASE_URL"
