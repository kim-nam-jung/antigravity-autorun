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
  // WSL2 natively supports localhost forwarding to Windows host.
  // Chrome CDP binds strictly to 127.0.0.1, making the Hyper-V nameserver IP fail.
  return '127.0.0.1';
}
