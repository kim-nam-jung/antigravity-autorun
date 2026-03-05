const cp = require('child_process');
console.log('With Profile:');
try { console.log(cp.execSync('powershell.exe -Command "\\$env:TEMP"').toString()); } catch(e){ console.log(e.message); }
console.log('Without Profile (-NoProfile):');
try { console.log(cp.execSync('powershell.exe -NoProfile -Command "\\$env:TEMP"').toString()); } catch(e){ console.log(e.message); }
