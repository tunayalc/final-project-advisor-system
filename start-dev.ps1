$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeExe = (Get-Command node -ErrorAction Stop).Source
$backendDir = Join-Path $repoRoot 'backend'
$frontendDir = Join-Path $repoRoot 'frontend'

foreach ($port in @(3000, 5173)) {
  if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
    throw "$port portu zaten kullanılıyor. Önce mevcut servisi kapatın."
  }
}

& $nodeExe (Join-Path $backendDir 'scripts/setup-local.js')
if ($LASTEXITCODE -ne 0) { throw 'Yerel ayarlar oluşturulamadı.' }

$backendProcess = Start-Process -FilePath $nodeExe -ArgumentList 'server.js' -WorkingDirectory $backendDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $repoRoot 'backend-start.log') -RedirectStandardError (Join-Path $repoRoot 'backend-start.err.log')
$frontendProcess = Start-Process -FilePath $nodeExe -ArgumentList 'node_modules/vite/bin/vite.js --host 127.0.0.1 --strictPort' -WorkingDirectory $frontendDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $repoRoot 'frontend-start.log') -RedirectStandardError (Join-Path $repoRoot 'frontend-start.err.log')
Write-Host "Frontend: http://localhost:5173 (PID $($frontendProcess.Id))"
Write-Host "Backend: http://localhost:3000/api (PID $($backendProcess.Id))"
Write-Host 'Yönetici giriş bilgileri: backend/.env'
