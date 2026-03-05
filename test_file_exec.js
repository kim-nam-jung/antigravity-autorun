const cp = require('child_process');
const fs = require('fs');

const scriptPathWin = 'C:\\Windows\\Temp\\test_file_exec.ps1';
const testScriptLocal = '/mnt/c/Windows/Temp/test_file_exec.ps1';
try {
  fs.writeFileSync(testScriptLocal, 'Write-Host "IT WORKS FROM FILE!" -ForegroundColor Red\nStart-Sleep -Seconds 5', 'utf8');
} catch (e) {}

const psCommand = `Start-Process powershell.exe -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Normal', '-File', '${scriptPathWin}'`;
const base64Command = Buffer.from(psCommand, 'utf16le').toString('base64');

const child = cp.spawn('powershell.exe', [
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-EncodedCommand', base64Command
], { detached: true, stdio: 'inherit' });
child.unref();

console.log('Spawned file exec test');
