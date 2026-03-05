const cp = require('child_process');
const psCommand = `Start-Process powershell.exe -ArgumentList '-NoProfile', '-Command', 'Write-Host "hello arg list"; Start-Sleep 3'`;
const base64Command = Buffer.from(psCommand, 'utf16le').toString('base64');
console.log(base64Command);

const child = cp.spawn('powershell.exe', [
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-EncodedCommand', base64Command
], { detached: true, stdio: 'inherit' });
 child.on('exit', () => console.log('Done'));
