import * as vscode from 'vscode';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { CDPConnection } from './cdp/connection';
import { ButtonClicker } from './buttons/clicker';
import { StatusBarUI } from './ui/statusBar';
import { findAntigravityPath } from './launcher/pathFinder';
import { isWSL } from './utils/os';

const execAsync = promisify(exec);

let cdpConnection: CDPConnection | null = null;
let buttonClicker: ButtonClicker | null = null;
let statusBarUI: StatusBarUI | null = null;
let isEnabled = false;
let diagnosticsChannel: vscode.OutputChannel | null = null;

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

  diagnosticsChannel = vscode.window.createOutputChannel('Antigravity Autorun Diagnostics');
  context.subscriptions.push(diagnosticsChannel);

  const diagnoseCommand = vscode.commands.registerCommand(
    'antigravity-autorun.diagnose',
    async () => {
      await runDiagnostics(cdpPort);
    }
  );

  context.subscriptions.push(toggleCommand, reconnectCommand, restartWithCDPCommand, diagnoseCommand);

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
  if (!cdpConnection || !buttonClicker || !statusBarUI) {
    return;
  }

  try {
    await cdpConnection.connect();
    buttonClicker.start();
    isEnabled = true;
    statusBarUI.setEnabled(true);
    vscode.window.showInformationMessage('Antigravity Autorun: ON');
  } catch (error) {
    statusBarUI.setError(true);

    // CDP 연결 실패 시 재시작 여부 묻기
    const config = vscode.workspace.getConfiguration('antigravityAutorun');
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

async function runDiagnostics(port: number) {
  if (!diagnosticsChannel) return;
  diagnosticsChannel.show();
  diagnosticsChannel.appendLine(`--- Diagnostics Run at ${new Date().toISOString()} ---`);
  
  diagnosticsChannel.appendLine('1. Checking CDP Connection Context...');
  diagnosticsChannel.appendLine(`Target Port: ${port}`);
  
  diagnosticsChannel.appendLine('\n2. Running Path Finder...');
  const result = await findAntigravityPath();
  
  diagnosticsChannel.appendLine(`Tried Paths:`);
  result.triedPaths.forEach(p => diagnosticsChannel!.appendLine(` - ${p}`));
  
  diagnosticsChannel.appendLine(`\nResult Path: ${result.path ? result.path : 'NOT FOUND'}`);
  diagnosticsChannel.appendLine(`Discovery Method: ${result.method}`);
  
  if (result.path) {
    diagnosticsChannel.appendLine(`\n3. Start Command:`);
    diagnosticsChannel.appendLine(`start "" "${result.path}" --remote-debugging-port=${port}`);
  }
}

// Antigravity를 CDP 모드로 재시작
async function restartAntigravityWithCDP(port: number): Promise<void> {
  if (!statusBarUI) return;

  statusBarUI.setConnecting(true);

  try {
    // 1. 현재 Antigravity 프로세스 종료
    vscode.window.showInformationMessage('Antigravity를 재시작합니다...');

    // 기존 연결 종료
    if (cdpConnection) {
      await cdpConnection.disconnect();
    }

    // 2. Antigravity 경로 찾기
    const pathResult = await findAntigravityPath();

    if (!pathResult.path) {
      // 경로 못 찾음: 사용자 피드백
      const triedPathsMsg = pathResult.triedPaths.join('\n');
      console.error(`Antigravity not found. Tried:\n${triedPathsMsg}`);
      
      const action = await vscode.window.showErrorMessage(
        'Antigravity 경로를 찾을 수 없습니다. 설정에서 경로를 지정해주세요.',
        '설정에서 경로 지정',
        '수동 실행 명령 복사'
      );

      if (action === '설정에서 경로 지정') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'antigravityAutorun.antigravityPath');
      } else if (action === '수동 실행 명령 복사') {
        const cmd = `antigravity --remote-debugging-port=${port}`;
        await vscode.env.clipboard.writeText(cmd);
        vscode.window.showInformationMessage('명령어가 클립보드에 복사되었습니다.');
      }
      throw new Error('경로를 찾을 수 없음');
    }

      // 3. 프로세스 종료 및 독립적 재시작 (WSL 호환을 위해 PowerShell 사용)
    if (isWSL() || process.platform === 'win32') {
      const psCommand = `
        Stop-Process -Name Antigravity -Force -ErrorAction SilentlyContinue;
        Start-Sleep -Seconds 2;
        Start-Process -FilePath "${pathResult.path}" -ArgumentList "--remote-debugging-port=${port}"
      `.replace(/\n/g, ' ').trim();

      const child = spawn('powershell.exe', ['-WindowStyle', 'Hidden', '-Command', psCommand], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref(); // VS Code와 프로세스를 완전히 분리 (독립 실행)
    } else {
      const command = `start "" "${pathResult.path}" --remote-debugging-port=${port}`;
      await execAsync(command, { shell: 'cmd.exe' });
    }

    // 4. Antigravity가 시작될 때까지 대기
    vscode.window.showInformationMessage('Antigravity 시작 대기 중...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 5. CDP 연결 재시도
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
        vscode.window.showInformationMessage('Antigravity Autorun: ON (CDP 모드로 재시작됨)');
      } else {
        const action = await vscode.window.showErrorMessage(
          'CDP 연결 실패. 수동으로 명령어 실행 후 다시 시도하거나, 진단을 실행해보세요.',
          '수동 실행 명령 복사',
          '진단 실행'
        );
        
        if (action === '수동 실행 명령 복사') {
          const cmd = `"${pathResult.path}" --remote-debugging-port=${port}`;
          await vscode.env.clipboard.writeText(cmd);
          vscode.window.showInformationMessage('명령어가 클립보드에 복사되었습니다.');
        } else if (action === '진단 실행') {
          await runDiagnostics(port);
        }
        
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
  if (diagnosticsChannel) {
    diagnosticsChannel.dispose();
  }
  console.log('Antigravity Autorun deactivated');
}
