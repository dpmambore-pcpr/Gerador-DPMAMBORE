#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/analisador-google-forense"
python3 -m pip install -q -r requirements.txt
echo "Analisador Google Forense em http://127.0.0.1:5050"
exec python3 app.py
