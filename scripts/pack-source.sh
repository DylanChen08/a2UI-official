#!/usr/bin/env bash
# 源码压缩包：不含 dist / node_modules / .git / .pnpm 等；同时生成 .tar.gz 与 .zip
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="${PACK_NAME:-a2ui-full-source}"
OUT_TAR="${PACK_OUT:-$ROOT/${NAME}.tar.gz}"
OUT_ZIP="${PACK_OUT_ZIP:-$ROOT/${NAME}.zip}"
TMP_TAR="${TMPDIR:-/tmp}/a2ui-pack-$$.tar.gz"
TMP_ZIP="${TMPDIR:-/tmp}/a2ui-pack-$$.zip"

echo "Packing: $ROOT"
echo "Output:  $OUT_TAR"
echo "         $OUT_ZIP"

tar -czf "$TMP_TAR" \
  -C "$ROOT" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.pnpm' \
  --exclude='.pnpm-store' \
  --exclude='.DS_Store' \
  --exclude='*.tar.gz' \
  --exclude='*.tgz' \
  --exclude='*.zip' \
  .

mv "$TMP_TAR" "$OUT_TAR"

rm -f "$TMP_ZIP"
(
  cd "$ROOT"
  # Info-ZIP：-x 可重复；与 tar 的 --exclude 目录规则对齐（兼容 macOS 自带 bash 3.2，不用 mapfile）
  zip -rq "$TMP_ZIP" . \
    -x '.git/*' \
    -x '*/.git/*' \
    -x 'node_modules/*' \
    -x '*/node_modules/*' \
    -x 'dist/*' \
    -x '*/dist/*' \
    -x '.pnpm/*' \
    -x '*/.pnpm/*' \
    -x '.pnpm-store/*' \
    -x '*/.pnpm-store/*' \
    -x '*.DS_Store' \
    -x '*.tar.gz' \
    -x '*.tgz' \
    -x '*.zip'
)
mv "$TMP_ZIP" "$OUT_ZIP"

ls -lh "$OUT_TAR" "$OUT_ZIP"
echo "Done."
