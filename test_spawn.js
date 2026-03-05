const cp = require('child_process');
cp.spawn('powershell.exe', [
  '-Command',
  "Start-Process powershell.exe -ArgumentList '-ExecutionPolicy Bypass -NoExit -WindowStyle Normal -Command \"echo WSL_TEST; Start-Sleep 5\"'"
], { detached: true, stdio: 'ignore' }).unref();
console.log('Spawned');
