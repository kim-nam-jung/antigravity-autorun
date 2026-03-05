const cp = require('child_process');
const fs = require('fs');

const scriptPathWin = 'C:\\Windows\\Temp\\test_visible_2.ps1';
const testScriptLocal = '/mnt/c/Windows/Temp/test_visible_2.ps1';
try {
  fs.writeFileSync(testScriptLocal, 'Write-Host "IT WORKS 2!" -ForegroundColor Cyan\nStart-Sleep -Seconds 5', 'utf8');
} catch (e) {}

// Method using Start-Process to pop a visible window
const child = cp.spawn('powershell.exe', [
  '-NoProfile',
  '-Command',
  `Start-Process powershell.exe -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Normal', '-File', '${scriptPathWin}'`
], { detached: true, stdio: 'ignore' });

child.unref();

console.log('Spawned method Start-Process');
