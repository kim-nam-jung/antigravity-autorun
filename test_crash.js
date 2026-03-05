const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const scriptPath = path.join(os.tmpdir(), 'test_crash.ps1');
const psScript = `Write-Host "Antigravity CDP Autorun - Relaunching..." -ForegroundColor Cyan
Start-Sleep -Seconds 1
Write-Host "Stopping existing Antigravity process..." -ForegroundColor Yellow
Stop-Process -Name Antigravity -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "Starting Antigravity with --remote-debugging-port=9222..." -ForegroundColor Green
Start-Process -FilePath 'C:\\Users\\skawn\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe' -ArgumentList '--remote-debugging-port=9222' -WindowStyle Normal
Write-Host "Done. This window will close in 3 seconds." -ForegroundColor Cyan
Start-Sleep -Seconds 3`;

fs.writeFileSync(scriptPath, psScript, 'utf8');

const child = cp.spawn('cmd.exe', [
  '/c',
  'start',
  '""',
  'powershell.exe',
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-WindowStyle', 'Normal',
  '-File', scriptPath
], { detached: true, stdio: 'ignore' });

child.unref();
console.log('Spawned test script');
