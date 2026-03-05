const cp = require('child_process');
const psCommand = `Stop-Process -Name Antigravity -Force; Start-Sleep 5; Write-Host "Ended"`;
const base64Command = Buffer.from(psCommand, 'utf16le').toString('base64');
console.log(base64Command);

const child = cp.spawn('powershell.exe', [
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-EncodedCommand', base64Command
], { detached: true, stdio: 'inherit' });
 child.on('exit', () => console.log('Done'));
