// Base64 인코딩 테스트
const cp = require('child_process');

const exePath = 'C:\\Users\\skawn\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe';
const userDataDir = 'C:\\Users\\skawn\\AppData\\Local\\Temp\\AgCDPProfile';
const cdpPort = 9222;

const psScript = `Start-Process -FilePath "${exePath}" -ArgumentList "--user-data-dir=${userDataDir}","--remote-debugging-port=${cdpPort}"`;
const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

console.log('[Test] PowerShell script:');
console.log(psScript);
console.log('\n[Test] Base64 encoded:');
console.log(encoded);
console.log('\n[Test] Base64 length:', encoded.length);

console.log('\n[Test] Spawning PowerShell with -EncodedCommand...');

const proc = cp.spawn("powershell.exe", ["-NoProfile", "-EncodedCommand", encoded], {
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe']
});

proc.stderr.on('data', (data) => {
  console.log('[Test] stderr:', data.toString());
});

proc.on('error', (err) => {
  console.log('[Test] Process error:', err.message);
});

proc.on('close', (code) => {
  console.log('[Test] Process exited with code:', code);
});

proc.unref();

console.log('[Test] Process spawned, PID:', proc.pid);

setTimeout(() => {
  console.log('[Test] Checking if Antigravity process exists...');
  cp.exec('powershell.exe -Command "Get-Process -Name Antigravity -ErrorAction SilentlyContinue | Select-Object Id | ConvertTo-Json"', (err, stdout) => {
    if (err) {
      console.log('[Test] No Antigravity process found');
    } else {
      console.log('[Test] Antigravity processes:', stdout.trim());
    }
    process.exit(0);
  });
}, 3000);
