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
  console.log('Antigravity Auto Accept is activating...');

  // Initialize UI
  statusBarUI = new StatusBarUI();
  context.subscriptions.push(statusBarUI);

  // Get configuration
  const config = vscode.workspace.getConfiguration('antigravityAutoAccept');
  const cdpPort = config.get<number>('cdpPort', 9222);
  const enabled = config.get<boolean>('enabled', true);

  // Initialize CDP connection
  cdpConnection = new CDPConnection(cdpPort);
  buttonClicker = new ButtonClicker(cdpConnection, config);

  // Register commands
  const toggleCommand = vscode.commands.registerCommand(
    'antigravity-auto-accept.toggle',
    async () => {
      await toggleAutoAccept();
    }
  );

  const reconnectCommand = vscode.commands.registerCommand(
    'antigravity-auto-accept.reconnect',
    async () => {
      await reconnectCDP();
    }
  );

  const restartWithCDPCommand = vscode.commands.registerCommand(
    'antigravity-auto-accept.restartWithCDP',
    async () => {
      await restartAntigravityWithCDP(cdpPort);
    }
  );

  context.subscriptions.push(toggleCommand, reconnectCommand, restartWithCDPCommand);

  // Auto-start if enabled
  if (enabled) {
    await startAutoAccept();
  }

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('antigravityAutoAccept')) {
        handleConfigChange();
      }
    })
  );

  console.log('Antigravity Auto Accept activated!');
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
    buttonClicker.start();
    isEnabled = true;
    statusBarUI.setEnabled(true);
    vscode.window.showInformationMessage('Antigravity Auto Accept: ON');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    statusBarUI.setError(true);

    // CDP 연결 실패 시 재시작 여부 묻기
    const config = vscode.workspace.getConfiguration('antigravityAutoAccept');
    const cdpPort = config.get<number>('cdpPort', 9222);

    const action = await vscode.window.showErrorMessage(
      `CDP 연결 실패: Antigravity를 CDP 모드로 재시작할까요?`,
      'Yes, Restart',
      'No'
    );

    if (action === 'Yes, Restart') {
      await restartAntigravityWithCDP(cdpPort);
    }
  }
}

async function stopAutoAccept() {
  if (!buttonClicker || !statusBarUI) {
    return;
  }

  buttonClicker.stop();
  isEnabled = false;
  statusBarUI.setEnabled(false);
  vscode.window.showInformationMessage('Antigravity Auto Accept: OFF');
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
  const config = vscode.workspace.getConfiguration('antigravityAutoAccept');

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

// Antigravity를 CDP 모드로 재시작
async function restartAntigravityWithCDP(port: number): Promise<void> {
  if (!statusBarUI) return;

  statusBarUI.setConnecting(true);

  try {
    // 1. 현재 Antigravity 프로세스 종료
    vscode.window.showInformationMessage('Antigravity를 재시작합니다...');

    if (process.platform === 'win32') {
      try {
        await execAsync('taskkill /IM Antigravity.exe /F');
      } catch {
        // 이미 종료되어 있을 수 있음
      }
    }

    // 2. 잠시 대기
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3. Antigravity 경로 찾기
    let antigravityPath: string | null = null;
    const fs = require('fs');

    for (const path of ANTIGRAVITY_PATHS) {
      if (path && fs.existsSync(path)) {
        antigravityPath = path;
        break;
      }
    }

    if (!antigravityPath) {
      throw new Error('Antigravity 설치 경로를 찾을 수 없습니다.');
    }

    // 4. CDP 포트와 함께 재시작
    const command = `start "" "${antigravityPath}" --remote-debugging-port=${port}`;
    await execAsync(command, { shell: 'cmd.exe' });

    // 5. Antigravity가 시작될 때까지 대기
    vscode.window.showInformationMessage('Antigravity 시작 대기 중...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 6. CDP 연결 재시도
    if (cdpConnection) {
      let connected = false;
      for (let i = 0; i < 10; i++) {
        try {
          await cdpConnection.connect();
          connected = true;
          break;
        } catch {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (connected && buttonClicker) {
        buttonClicker.start();
        isEnabled = true;
        statusBarUI.setEnabled(true);
        vscode.window.showInformationMessage('Antigravity Auto Accept: ON (CDP 모드로 재시작됨)');
      } else {
        throw new Error('CDP 연결 실패');
      }
    }
  } catch (error) {
    statusBarUI.setConnecting(false);
    statusBarUI.setError(true);
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`재시작 실패: ${message}`);
  }
}

export function deactivate() {
  if (buttonClicker) {
    buttonClicker.stop();
  }
  if (cdpConnection) {
    cdpConnection.disconnect();
  }
  console.log('Antigravity Auto Accept deactivated');
}
