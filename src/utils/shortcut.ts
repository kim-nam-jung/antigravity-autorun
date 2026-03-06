import * as cp from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(cp.exec);

export async function createDesktopShortcut(
  exePath: string, 
  cdpPort: number, 
  logFn: (msg: string) => void
): Promise<boolean> {
  logFn(`[Launcher] Creating CDP shortcut...`);

  const shortcutScript = `
$WshShell = New-Object -ComObject WScript.Shell
$Desktop = [Environment]::GetFolderPath('Desktop')
$Shortcut = $WshShell.CreateShortcut("$Desktop\\Antigravity CDP Mode.lnk")
$Shortcut.TargetPath = "${exePath}"
$Shortcut.Arguments = "--remote-debugging-port=${cdpPort}"
$Shortcut.WorkingDirectory = Split-Path "${exePath}"
$Shortcut.Description = "Antigravity with CDP on port ${cdpPort}"
$Shortcut.Save()
Write-Output "Shortcut created"
`.trim();

  const encoded = Buffer.from(shortcutScript, 'utf16le').toString('base64');

  try {
    const result = await execAsync(`powershell.exe -NoProfile -EncodedCommand ${encoded}`);
    logFn(`[Launcher] Shortcut created: ${result.stdout}`);

    const action = await vscode.window.showInformationMessage(
      `Shortcut "Antigravity CDP Mode" created on desktop.\n\n1. Close current Antigravity\n2. Double-click the desktop shortcut`,
      'OK',
      'Open Desktop'
    );

    if (action === 'Open Desktop') {
      const desktopPath = process.env.USERPROFILE ? `${process.env.USERPROFILE}\\Desktop` : '';
      if (desktopPath) {
        await execAsync(`explorer.exe "${desktopPath}"`);
      }
    }
    
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logFn(`[Launcher] Failed to create shortcut: ${message}`);
    vscode.window.showErrorMessage(`Failed to create shortcut: ${message}`);
    return false;
  }
}

export async function relaunchAntigravityWithCDP(
  exePath: string,
  cdpPort: number,
  logFn: (msg: string) => void
): Promise<void> {
  logFn(`[Launcher] Auto-relaunching Antigravity with CDP on port ${cdpPort}...`);

  try {
    const relauncerExePath = path.join(__dirname, '..', '..', 'bin', 'relauncher.exe');
    if (!fs.existsSync(relauncerExePath)) {
      throw new Error(`Relauncher executable not found at ${relauncerExePath}`);
    }

    logFn(`[Launcher] Spawning background Go executable: ${relauncerExePath}`);

    // Launch Go executable completely detached
    const child = cp.spawn(relauncerExePath, [exePath, `--remote-debugging-port=${cdpPort}`], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    
    child.unref();
    
    logFn('[Launcher] Relaunch Go executable spawned. Editor should close shortly.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logFn(`[Launcher] Failed to relaunch: ${message}`);
    vscode.window.showErrorMessage(`Failed to restart editor automatically: ${message}`);
  }
}

