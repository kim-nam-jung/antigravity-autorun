const cp = require('child_process');
const fs = require('fs');
let winTemp = cp.execSync('powershell.exe -Command "\\$env:TEMP"', { encoding: 'utf8' }).trim();
let localTemp = winTemp.replace(/^([A-Za-z]):\\/, (_, d) => `/mnt/${d.toLowerCase()}/`).replace(/\\/g, '/') + '/';
let testScriptWin = winTemp + '\\test_launch.ps1';
let testScriptLocal = localTemp + 'test_launch.ps1';

fs.writeFileSync(testScriptLocal, 'Write-Host "IT WORKS" -ForegroundColor Green\nStart-Sleep -Seconds 3', 'utf8');

const method1 = cp.spawn('powershell.exe', [
  '-NoProfile',
  '-Command',
  `Start-Process powershell.exe -ArgumentList '-NoProfile -ExecutionPolicy Bypass -WindowStyle Normal -File "${testScriptWin}"'`
], { detached: true, stdio: 'ignore' });
method1.unref();
console.log('Method 1 executed');
