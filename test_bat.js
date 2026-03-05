const cp = require('child_process');
const fs = require('fs');

const scriptPathWin = 'C:\\Windows\\Temp\\test_relaunch.bat';
const testScriptLocal = '/mnt/c/Windows/Temp/test_relaunch.bat';

const batContent = `
@echo off
echo Killing Antigravity...
taskkill /F /IM Antigravity.exe
timeout /t 2 /nobreak >nul
echo Starting Antigravity...
start "" "C:\\Users\\skawn\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe" --remote-debugging-port=9222
`;

try {
  fs.writeFileSync(testScriptLocal, batContent, 'utf8');
} catch (e) {}

// Direct background spawn
const child = cp.spawn('cmd.exe', [
  '/c',
  'start',
  '/B',
  '""',
  scriptPathWin
], { detached: true, stdio: 'ignore', windowsHide: true });
child.unref();

console.log('Spawned BAT test script');
