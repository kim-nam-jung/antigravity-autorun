#!/bin/bash
set -e
cd /home/skawn1057/Development/antigravity-autorun

TOKEN=$(cat .env | grep OVSX_TOKEN | cut -d= -f2 | tr -d '\r\n ')
echo "Token loaded (length=${#TOKEN})"

VSIX_FILE=$(ls antigravity-autorun-*.vsix | sort -V | tail -n 1)
echo "Publishing: $VSIX_FILE"

npx ovsx publish "$VSIX_FILE" -p "$TOKEN"
