import * as vscode from 'vscode';
import { CDPConnection, setCDPLogger } from './cdp/connection';
import { ButtonClicker } from './buttons/clicker';
import { StatusBarUI } from './ui/statusBar';
import CDP from 'chrome-remote-interface';

let cdpConnection: CDPConnection | null = null;
let buttonClicker: ButtonClicker | null = null;
let statusBarUI: StatusBarUI | null = null;
let outputChannel: vscode.OutputChannel;
let isEnabled = false;

function log(msg: string) {
  const ts = new Date().toLocaleTimeString();
  outputChannel.appendLine(`[${ts}] ${msg}`);
  console.log(msg);
}

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Antigravity Autorun');
  context.subscriptions.push(outputChannel);
  outputChannel.show(true);
  setCDPLogger((msg) => log(msg));

  log('Antigravity Autorun activating...');

  statusBarUI = new StatusBarUI();
  context.subscriptions.push(statusBarUI);

  const config = vscode.workspace.getConfiguration('antigravityAutorun');
  const cdpPort = config.get<number>('cdpPort', 9222);
  const enabled = config.get<boolean>('enabled', true);

  log(`Config: cdpPort=${cdpPort}, enabled=${enabled}`);

  cdpConnection = new CDPConnection(cdpPort);
  buttonClicker = new ButtonClicker(cdpConnection, config);

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity-autorun.toggle', () => toggleAutorun()),
    vscode.commands.registerCommand('antigravity-autorun.reconnect', () => reconnectCDP()),
    vscode.commands.registerCommand('antigravity-autorun.diagnose', () => diagnoseCDP()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('antigravityAutorun')) {
        handleConfigChange();
      }
    }),
  );

  if (enabled) {
    statusBarUI.setConnecting(true);
    startAutorun().catch(console.error);
  }

  log('Antigravity Autorun activated!');
}

async function diagnoseCDP() {
  outputChannel.show(true);
  log('=== CDP Diagnosis ===');
  const ports = [9222, 9223, 9224, 9225, 9229, 9333];
  for (const port of ports) {
    try {
      const targets = await Promise.race([
        CDP.List({ port }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
      ]);
      log(`Port ${port}: ${(targets as any[]).length} targets found`);
      (targets as any[]).forEach((t: any) => {
        log(`  → [${t.type}] "${t.title}" | ${t.url}`);
      });
    } catch {
      log(`Port ${port}: not available`);
    }
  }
  log('=== End Diagnosis ===');
}

async function toggleAutorun() {
  if (isEnabled) {
    await stopAutorun();
  } else {
    await startAutorun();
  }
}

async function startAutorun() {
  if (!cdpConnection || !buttonClicker || !statusBarUI) return;

  try {
    statusBarUI.setConnecting(true);
    await cdpConnection.connect();
    await buttonClicker.start();
    isEnabled = true;
    statusBarUI.setEnabled(true);
    log(`[Autorun] ON — connected to CDP port ${cdpConnection.getPort()}`);
  } catch (error) {
    isEnabled = false;
    statusBarUI.setEnabled(false);
    statusBarUI.setError(true);
    const message = error instanceof Error ? error.message : 'Unknown error';
    log(`[Autorun] Failed to start: ${message}`);
    vscode.window.showErrorMessage(
      `CDP connection failed: ${message}. Antigravity가 실행 중인지 확인하세요.`
    );
  }
}

async function stopAutorun() {
  if (!buttonClicker || !statusBarUI) return;
  isEnabled = false;
  await buttonClicker.stop();
  await cdpConnection?.disconnect();
  statusBarUI.setEnabled(false);
  log('[Autorun] OFF');
  vscode.window.showInformationMessage('Antigravity Autorun: OFF');
}

async function reconnectCDP() {
  if (!cdpConnection || !buttonClicker || !statusBarUI) return;
  statusBarUI.setConnecting(true);
  log('[Reconnect] Manual reconnect triggered');
  try {
    await cdpConnection.disconnect();
    await cdpConnection.connect();
    await buttonClicker.restart();
    isEnabled = true;
    statusBarUI.setConnecting(false);
    statusBarUI.setEnabled(true);
    log('[Reconnect] Manual reconnect success');
    vscode.window.showInformationMessage('CDP reconnected');
  } catch (error) {
    statusBarUI.setConnecting(false);
    statusBarUI.setError(true);
    isEnabled = false;
    const message = error instanceof Error ? error.message : 'Unknown error';
    log(`[Reconnect] Manual reconnect failed: ${message}`);
    vscode.window.showErrorMessage(`CDP reconnection failed: ${message}`);
  }
}

function handleConfigChange() {
  const config = vscode.workspace.getConfiguration('antigravityAutorun');
  buttonClicker?.updateConfig(config);
  const newPort = config.get<number>('cdpPort', 9222);
  if (cdpConnection && cdpConnection.getPort() !== newPort) {
    cdpConnection.setPort(newPort);
    if (isEnabled) {
      reconnectCDP().catch(console.error);
    }
  }
}

export async function deactivate() {
  isEnabled = false;
  try {
    if (buttonClicker) await buttonClicker.stop();
    if (cdpConnection) await cdpConnection.disconnect();
  } catch (error) {
    console.error('Error during deactivation:', error);
  }
  log('Antigravity Autorun deactivated');
}
