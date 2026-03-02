import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CDPConnection } from './cdp/connection';
import { ButtonClicker } from './buttons/clicker';
import { StatusBarUI } from './ui/statusBar';

const execAsync = promisify(exec);

let cdpConnection: CDPConnection | null = null;
let buttonClicker: ButtonClicker | null = null;
let statusBarUI: StatusBarUI | null = null;
let isEnabled = false;

// Antigravity 경로 (Windows)
const ANTIGRAVITY_PATHS = [
  process.env.LOCALAPPDATA + '\\Programs\\Antigravity\\bin\\antigravity.cmd',
  process.env.LOCALAPPDATA + '\\Programs\\Antigravity\\Antigravity.exe',
  'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Programs\\Antigravity\\bin\\antigravity.cmd',
];

export async function activate(context: vscode.ExtensionContext) {
  console.log('Antigravity Autorun is activating...');
  vscode.window.showInformationMessage('Antigravity Autorun: activating...');

  // Initialize UI
  statusBarUI = new StatusBarUI();
  context.subscriptions.push(statusBarUI);

  // Get configuration
  const config = vscode.workspace.getConfiguration('antigravityAutorun');
  const cdpPort = config.get<number>('cdpPort', 9223);
  const enabled = config.get<boolean>('enabled', true);

  // Initialize CDP connection
  cdpConnection = new CDPConnection(cdpPort);
  buttonClicker = new ButtonClicker(cdpConnection, config);

  // Register commands
  const toggleCommand = vscode.commands.registerCommand(
    'antigravity-autorun.toggle',
    async () => {
      await toggleAutoAccept();
    }
  );

  const reconnectCommand = vscode.commands.registerCommand(
    'antigravity-autorun.reconnect',
    async () => {
      await reconnectCDP();
    }
  );

  const restartWithCDPCommand = vscode.commands.registerCommand(
    'antigravity-autorun.restartWithCDP',
    async () => {
      await restartAntigravityWithCDP(cdpPort);
    }
  );

  context.subscriptions.push(toggleCommand, reconnectCommand, restartWithCDPCommand);

  // Auto-start if enabled (non-blocking so activate completes immediately)
  if (enabled) {
    startAutoAccept().catch(console.error);
  }

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('antigravityAutorun')) {
        handleConfigChange();
      }
    })
  );

  console.log('Antigravity Autorun activated!');
}

async function toggleAutoAccept() {
  if (isEnabled) {
    await stopAutoAccept();
  } else {
    await startAutoAccept();
  }
}

async function startAutoAccept() {
  if (!cdpConnection || !buttonClicker || !statusBarUI) {
    return;
  }

  try {
    await cdpConnection.connect();
    await buttonClicker.start();
    isEnabled = true;
    statusBarUI.setEnabled(true);
    vscode.window.showInformationMessage('Antigravity Autorun: ON - CDP connected!');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    statusBarUI.setError(true);

    // Ask to restart with CDP if connection failed
    const config = vscode.workspace.getConfiguration('antigravityAutorun');
    const cdpPort = config.get<number>('cdpPort', 9223);

    vscode.window.showErrorMessage(
      `CDP connection failed: Restart Antigravity with CDP mode?`,
      'Yes, Restart',
      'No'
    ).then(action => {
      if (action === 'Yes, Restart') {
        restartAntigravityWithCDP(cdpPort);
      }
    });
  }
}

async function stopAutoAccept() {
  if (!buttonClicker || !statusBarUI) {
    return;
  }

  buttonClicker.stop();
  isEnabled = false;
  statusBarUI.setEnabled(false);
  vscode.window.showInformationMessage('Antigravity Autorun: OFF');
}

async function reconnectCDP() {
  if (!cdpConnection || !statusBarUI) {
    return;
  }

  statusBarUI.setConnecting(true);

  try {
    await cdpConnection.disconnect();
    await cdpConnection.connect();
    statusBarUI.setConnecting(false);
    statusBarUI.setEnabled(isEnabled);
    vscode.window.showInformationMessage('CDP reconnected successfully');
  } catch (error) {
    statusBarUI.setConnecting(false);
    statusBarUI.setError(true);
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`CDP reconnection failed: ${message}`);
  }
}

function handleConfigChange() {
  const config = vscode.workspace.getConfiguration('antigravityAutorun');

  if (buttonClicker) {
    buttonClicker.updateConfig(config);
  }

  // Check if port changed
  const newPort = config.get<number>('cdpPort', 9222);
  if (cdpConnection && cdpConnection.getPort() !== newPort) {
    cdpConnection.setPort(newPort);
    if (isEnabled) {
      reconnectCDP();
    }
  }
}

// Restart Antigravity with CDP mode
async function restartAntigravityWithCDP(port: number): Promise<void> {
  if (!statusBarUI) return;

  statusBarUI.setConnecting(true);

  try {
    const fs = require('fs');
    const path = require('path');

    // 1. Find Antigravity path
    let antigravityPath: string | null = null;

    for (const p of ANTIGRAVITY_PATHS) {
      if (p && fs.existsSync(p)) {
        antigravityPath = p;
        break;
      }
    }

    if (!antigravityPath) {
      throw new Error('Antigravity installation path not found.');
    }

    // 2. Create batch file for restart
    const tempDir = process.env.TEMP || 'C:\\Temp';
    const batchPath = path.join(tempDir, 'restart-antigravity-cdp.bat');

    const batchContent = `@echo off
timeout /t 2 /nobreak > nul
taskkill /IM Antigravity.exe /F 2>nul
timeout /t 2 /nobreak > nul
start "" "${antigravityPath}" --remote-debugging-port=${port}
del "%~f0"
`;

    fs.writeFileSync(batchPath, batchContent);

    // 3. Run batch file (detached - runs independently of Antigravity)
    const { spawn } = require('child_process');
    spawn('cmd.exe', ['/c', batchPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref();

    vscode.window.showInformationMessage('Restarting Antigravity with CDP mode. Please wait...');

    // 4. Wait for Antigravity to restart
    await new Promise(resolve => setTimeout(resolve, 8000));

    // 5. Retry CDP connection
    if (cdpConnection) {
      let connected = false;
      for (let i = 0; i < 15; i++) {
        try {
          await cdpConnection.connect();
          connected = true;
          break;
        } catch {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (connected && buttonClicker) {
        await buttonClicker.start();
        isEnabled = true;
        statusBarUI.setEnabled(true);
        vscode.window.showInformationMessage('Antigravity Autorun: ON (Restarted with CDP)');
      } else {
        throw new Error('CDP connection failed - Check if Antigravity started with CDP mode');
      }
    }
  } catch (error) {
    statusBarUI.setConnecting(false);
    statusBarUI.setError(true);
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Restart failed: ${message}`);
  }
}

export function deactivate() {
  if (buttonClicker) {
    buttonClicker.stop();
  }
  if (cdpConnection) {
    cdpConnection.disconnect();
  }
  console.log('Antigravity Autorun deactivated');
}
