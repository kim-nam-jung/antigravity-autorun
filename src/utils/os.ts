import * as fs from 'fs';

export function isWSL(): boolean {
  if (process.platform !== 'linux') return false;
  try {
    const version = fs.readFileSync('/proc/version', 'utf8');
    return version.toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}

export function toWSLPath(winPath: string): string {
  return winPath.replace(/^([A-Za-z]):\\/, (_, drive) => `/mnt/${drive.toLowerCase()}/`)
                .replace(/\\/g, '/');
}

export function getWindowsHost(): string {
  try {
    const resolv = fs.readFileSync('/etc/resolv.conf', 'utf8');
    const match = resolv.match(/nameserver\s+([\d.]+)/);
    if (match) return match[1];
  } catch (e) {
    // Ignore file read error
  }
  return '127.0.0.1';
}
