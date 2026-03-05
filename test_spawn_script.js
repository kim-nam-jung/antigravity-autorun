const cp = require('child_process');
const fs = require('fs');

let winTemp = 'C:\\Windows\\Temp';
try {
  // Fix the bash evaluation by properly escaping the $
  const psOut = cp.execSync('powershell.exe -Command "\\$env:TEMP"', { encoding: 'utf8' });
  winTemp = psOut.trim();
} catch (e) {
  console.error("Failed to get TEMP", e);
}
console.log('winTemp:', winTemp);

let scriptName = 'test_spawn_script.ps1';
let scriptPathWin = winTemp + '\\' + scriptName;
let scriptPathLocal = winTemp
  .replace(/^([A-Za-z]):\\/, (_, d) => `/mnt/${d.toLowerCase()}/`)
  .replace(/\\/g, '/') + '/' + scriptName;

console.log('local:', scriptPathLocal);
console.log('win:', scriptPathWin);

fs.writeFileSync(scriptPathLocal, 'Write-Host "Evaluating PowerShell..." -ForegroundColor Green\nStart-Sleep -Seconds 3', 'utf8');

console.log("Spawning cmd.exe...");
const child = cp.spawn('cmd.exe', [
  '/c',
  'start',
  'powershell.exe',
  '-ExecutionPolicy', 'Bypass',
  '-WindowStyle', 'Normal',
  '-File', scriptPathWin
], { stdio: 'inherit' });

child.on('error', console.error);
child.on('exit', (code) => console.log('cmd.exe exited with code', code));
