const cp = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const scriptPath = path.join(os.tmpdir(), 'test_ps_windows.ps1');
fs.writeFileSync(scriptPath, 'Write-Host "Hello PowerShell" -ForegroundColor Green\nStart-Sleep -Seconds 3', 'utf8');

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
console.log('Spawned cmd.exe /c start "" powershell.exe ...');
