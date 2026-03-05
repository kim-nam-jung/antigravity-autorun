const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const scriptPath = path.join(os.tmpdir(), `test_ps_windows_${Date.now()}.ps1`);
fs.writeFileSync(scriptPath, 'Write-Host "This is a visible test!" -ForegroundColor Green\nStart-Sleep -Seconds 3', 'utf8');

console.log('Spawning PowerShell script:', scriptPath);

// Method 2 (the one that we used in extension)
const child = cp.spawn('powershell.exe', [
  '-NoProfile',
  '-Command',
  `Start-Process powershell.exe -ArgumentList '-NoProfile -ExecutionPolicy Bypass -WindowStyle Normal -File "${scriptPath}"'`
], {
  detached: true,
  stdio: 'ignore'
});
child.unref();

console.log('Spawned successfully.');
