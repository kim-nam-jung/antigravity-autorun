const cp = require('child_process');
const path = require('path');

const exe = path.join(__dirname, 'bin', 'relauncher.exe');
const targetExe = 'C:\\Users\\skawn\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe';

console.log('Spawning go relauncher');
const child = cp.spawn(exe, [targetExe, '--remote-debugging-port=9222'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
});
child.unref();

console.log('Spawning complete, exit node.');
