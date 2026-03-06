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
    const scriptPath = path.join(os.tmpdir(), `relaunch_antigravity_${Date.now()}.ps1`);
    
    // PowerShell script that waits for VSCode to exit entirely, then starts it again with logging
    const psScript = `
$logPath = Join-Path $env:TEMP "antigravity_relaunch.log"
"[" + (Get-Date -Format 'o') + "] Starting relaunch script..." | Out-File -FilePath $logPath -Encoding utf8

Start-Sleep -Seconds 3

"[" + (Get-Date -Format 'o') + "] Waiting for Antigravity to exit..." | Out-File -FilePath $logPath -Append -Encoding utf8
$retryCount = 0
while ((Get-Process -Name "Antigravity" -ErrorAction SilentlyContinue) -and ($retryCount -lt 20)) {
    Start-Sleep -Milliseconds 500
    $retryCount++
}

"[" + (Get-Date -Format 'o') + "] Antigravity is closed. Starting new instance..." | Out-File -FilePath $logPath -Append -Encoding utf8
try {
    # We must use WMI to launch the process to escape the poisoned VSCode/Electron environment variables
    # (e.g., ELECTRON_RUN_AS_NODE) that the VBScript wrapper inherited from the parent Node process.
    $cmdLine = "\`"${exePath}\`" --remote-debugging-port=${cdpPort}"
    $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$cmdLine}
    
    if ($result.ReturnValue -eq 0) {
        "[" + (Get-Date -Format 'o') + "] Process started successfully via WMI. PID: " + $result.ProcessId | Out-File -FilePath $logPath -Append -Encoding utf8
    } else {
        "[" + (Get-Date -Format 'o') + "] WMI failed to launch. Error Code: " + $result.ReturnValue | Out-File -FilePath $logPath -Append -Encoding utf8
    }
} catch {
    "[" + (Get-Date -Format 'o') + "] Error starting process: $_" | Out-File -FilePath $logPath -Append -Encoding utf8
}

`;

    fs.writeFileSync(scriptPath, psScript, 'utf8');

    // Windows Job Object prevents direct detached children from surviving parent exit.
    // So we use a VBScript intermediate to launch the PowerShell script completely out-of-process.
    const vbsPath = path.join(os.tmpdir(), `relaunch_antigravity_${Date.now()}.vbs`);
    const vbsContent = `
Set objShell = CreateObject("WScript.Shell")
objShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & WScript.Arguments(0) & """", 0, False
`;
    fs.writeFileSync(vbsPath, vbsContent, 'utf8');

    logFn(`[Launcher] Spawning background PowerShell script via VBScript wrapper: ${scriptPath}`);

    // Launch VBScript completely detached
    const child = cp.spawn('wscript.exe', [vbsPath, scriptPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    
    child.unref();
    
    logFn('[Launcher] Relaunch VBS wrapper spawned. Editor should close shortly.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logFn(`[Launcher] Failed to relaunch: ${message}`);
    vscode.window.showErrorMessage(`Failed to restart editor automatically: ${message}`);
  }
}

