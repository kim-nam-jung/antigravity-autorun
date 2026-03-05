const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const scriptPathWin = path.join(os.tmpdir(), "test_b64.ps1");
fs.writeFileSync(scriptPathWin, 'Write-Host "BASE64 EXECUTED SUCCESSFULLY!" -ForegroundColor Green\nStart-Sleep -Seconds 3', 'utf8');

// The command to execute in the new window
const psCommand = `Start-Process powershell.exe -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Normal', '-File', '${scriptPathWin}'`;

// Base64 encode for PowerShell (-EncodedCommand expects UTF-16LE)
const base64Command = Buffer.from(psCommand, 'utf16le').toString('base64');

console.log("PS Command:", psCommand);
console.log("Encoded:", base64Command);

const child = cp.spawn('powershell.exe', [
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-EncodedCommand', base64Command
], { detached: true, stdio: 'ignore' });

child.unref();
console.log('Spawned successfully with Base64');
