$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Test-Path -LiteralPath '.venv/Scripts/python.exe')) { throw 'Сначала создайте .venv по инструкции README.' }
if (-not (Test-Path -LiteralPath 'frontend/dist/index.html')) { throw 'Сначала выполните npm --prefix frontend ci и npm --prefix frontend run build.' }
$env:PYTHONUTF8 = '1'
& ./.venv/Scripts/python.exe scripts/serve.py
