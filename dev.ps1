# Postarr dev launcher (Windows). Starts the FastAPI backend (:8000) and the
# Vite dev server (:5173) in separate windows. Open http://localhost:5173.
#
#   ./dev.ps1
#
# First time only: create the venv + install deps (see README).

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$py = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path $py)) {
  Write-Host "Backend venv not found. Run the one-time setup first:" -ForegroundColor Yellow
  Write-Host "  cd backend; python -m venv .venv; .venv\Scripts\activate; pip install -r requirements.txt"
  exit 1
}

Write-Host "Starting backend on http://localhost:8000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command",
  "cd '$backend'; `$env:PYTHONPATH='$backend'; `$env:POSTARR_RELOAD='1'; & '$py' run.py"

Write-Host "Starting frontend on http://localhost:5173 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontend'; npm run dev"

Write-Host "`nPostarr is starting. Open http://localhost:5173" -ForegroundColor Cyan
