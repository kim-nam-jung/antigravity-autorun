const cp = require('child_process');
const fs = require('fs');

const scriptPathWin = 'C:\\Windows\\Temp\\test_relaunch.ps1';
const testScriptLocal = '/mnt/c/Windows/Temp/test_relaunch.ps1';
const psScript = `
Write-Host "Killing Antigravity..."
Stop-Process -Name Antigravity -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "Starting Antigravity..."
Start-Process -FilePath "C:\\Users\\skawn\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe" -ArgumentList '--remote-debugging-port=9222'
Write-Host "Done"
`;

try {
  fs.writeFileSync(testScriptLocal, psScript, 'utf8');
} catch (e) {}

// Direct background spawn
const child = cp.spawn('powershell.exe', [
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-WindowStyle', 'Hidden',
  '-File', scriptPathWin
], { detached: true, stdio: 'ignore' });
child.unref();

console.log('Spawned test script');
