import * as vscode from 'vscode';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CDPConnection } from './cdp/connection';
import { NetworkAutoAccept } from './autorun/networkAutoAccept';
import { StatusBarUI } from './ui/statusBar';
import { findAntigravityPath } from './launcher/pathFinder';
import { isWSL } from './utils/os';

let cdpConnection: CDPConnection | null = null;
let networkAutoAccept: NetworkAutoAccept | null = null;
let statusBarUI: StatusBarUI | null = null;
let isEnabled = false;

export async function activate(context: vscode.ExtensionContext) {
  console.log('Antigravity Autorun is activating...');

  // Initialize UI
  statusBarUI = new StatusBarUI();
  context.subscriptions.push(statusBarUI);

  // Get configuration
  const config = vscode.workspace.getConfiguration('antigravityAutorun');
  const cdpPort = config.get<number>('cdpPort', 9222);
  const enabled = config.get<boolean>('enabled', true);

  // Initialize CDP connection
  cdpConnection = new CDPConnection(cdpPort);
  networkAutoAccept = new NetworkAutoAccept(cdpConnection, config);

  // Setup disconnect listener
  cdpConnection.onDisconnect = () => {
    if (isEnabled) {
      vscode.window.showWarningMessage('CDP 연결이 예기치 않게 끊어졌습니다.');
      stopAutoAccept();
    }
  };

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

  context.subscriptions.push(toggleCommand, reconnectCommand);

  // Auto-start if enabled
  if (enabled) {
    await startAutoAccept();
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
  if (!cdpConnection || !networkAutoAccept || !statusBarUI) {
    return;
  }

  try {
    await cdpConnection.connect();
    await networkAutoAccept.start();
    isEnabled = true;
    statusBarUI.setEnabled(true);
    vscode.window.showInformationMessage('Antigravity Autorun: ON (CDP)');
  } catch (error) {
    isEnabled = false;
    statusBarUI.setError(true);
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`CDP connection failed: ${message}`);
  }
}

async function stopAutoAccept() {
  if (!networkAutoAccept || !statusBarUI) {
    return;
  }

  await networkAutoAccept.stop();
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

  if (networkAutoAccept) {
    networkAutoAccept.updateConfig(config);
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



export async function deactivate() {
  if (networkAutoAccept) {
    await networkAutoAccept.stop();
  }
  if (cdpConnection) {
    await cdpConnection.disconnect();
  }
  console.log('Antigravity Autorun deactivated');
}
