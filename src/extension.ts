import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import CDP from 'chrome-remote-interface';
import { CDPConnection, setCDPLogger } from './cdp/connection';
import { ButtonClicker } from './buttons/clicker';
import { StatusBarUI } from './ui/statusBar';

let cdpConnection: CDPConnection | null = null;
let buttonClicker: ButtonClicker | null = null;
let statusBarUI: StatusBarUI | null = null;
let outputChannel: vscode.OutputChannel;

let isEnabled = false;
let watchdogInterval: NodeJS.Timeout | null = null;
let isReconnecting = false;

const ANTIGRAVITY_PATHS = [
  `${process.env.LOCALAPPDATA}\\Programs\\Antigravity\\Antigravity.exe`,
  `${process.env.LOCALAPPDATA}\\Programs\\Antigravity\\bin\\antigravity.cmd`,
  `C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe`,
  `C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Programs\\Antigravity\\bin\\antigravity.cmd`,
];

function log(msg: string) {
  const ts = new Date().toLocaleTimeString();
  outputChannel.appendLine(`[${ts}] ${msg}`);
  console.log(msg);
}

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Antigravity Autorun');
  context.subscriptions.push(outputChannel);
  outputChannel.show(true);
  setCDPLogger((msg) => log(msg)); // CDP 내부 로그도 outputChannel에 표시

  log('Antigravity Autorun activating...');

  statusBarUI = new StatusBarUI();
  context.subscriptions.push(statusBarUI);

  const config = vscode.workspace.getConfiguration('antigravityAutorun');
  const cdpPort = config.get<number>('cdpPort', 9222);
  const enabled = config.get<boolean>('enabled', true);

  log(`Config: cdpPort=${cdpPort}, enabled=${enabled}`);

  cdpConnection = new CDPConnection(cdpPort);
  buttonClicker = new ButtonClicker(cdpConnection, config);

  cdpConnection.onDisconnect(() => {
    log('[CDP] Disconnected externally');
    if (isEnabled && !isReconnecting) {
      handleUnexpectedDisconnect();
    }
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity-autorun.toggle', () => toggleAutorun()),
    vscode.commands.registerCommand('antigravity-autorun.reconnect', () => reconnectCDP()),
    vscode.commands.registerCommand('antigravity-autorun.restartWithCDP', () =>
      restartAntigravityWithCDP(cdpPort)
    ),
    // 진단 커맨드: 어느 포트에 어떤 CDP 타겟이 있는지 즉시 확인
    vscode.commands.registerCommand('antigravity-autorun.diagnose', () => diagnoseCDP()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('antigravityAutorun')) {
        handleConfigChange();
      }
    }),
  );

  watchdogInterval = setInterval(() => {
    if (!isEnabled || isReconnecting) return;
    if (!cdpConnection?.isActive()) {
      log('[Watchdog] CDP connection lost, triggering reconnect...');
      handleUnexpectedDisconnect();
    }
  }, 5000);

  context.subscriptions.push({
    dispose: () => {
      if (watchdogInterval) clearInterval(watchdogInterval);
    }
  });

  if (enabled) {
    statusBarUI.setConnecting(true);
    startAutorunWithRetry().catch(console.error);
  }

  log('Antigravity Autorun activated!');
}

/** 포트 진단 — Output 채널에 타겟 목록 출력 */
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
      log(`Port ${port}: ${targets.length} targets found`);
      (targets as any[]).forEach((t: any) => {
        log(`  → [${t.type}] "${t.title}" | ${t.url}`);
      });
    } catch (err) {
      log(`Port ${port}: not available`);
    }
  }
  log('=== End Diagnosis ===');
}

async function handleUnexpectedDisconnect() {
  if (!statusBarUI || isReconnecting) return;
  isReconnecting = true;
  statusBarUI.setConnecting(true);
  log('[Reconnect] Starting reconnect loop...');

  try {
    await buttonClicker?.stop();
    await reconnectLoop(60_000, 3_000);
    isReconnecting = false;
    log('[Reconnect] Success!');
  } catch {
    isReconnecting = false;
    statusBarUI.setConnecting(false);
    statusBarUI.setError(true);
    log('[Reconnect] Failed after 60s. Showing error state.');
  }
}

async function reconnectLoop(maxWaitMs: number, retryIntervalMs: number): Promise<void> {
  if (!cdpConnection || !buttonClicker || !statusBarUI) return;
  const deadline = Date.now() + maxWaitMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    try {
      log(`[Reconnect] Attempt ${attempt}...`);
      await cdpConnection.connect();
      await buttonClicker.start();
      statusBarUI.setEnabled(true);
      log('[Reconnect] Connected!');
      return;
    } catch (err) {
      log(`[Reconnect] Failed: ${err}. Waiting ${retryIntervalMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryIntervalMs));
    }
  }
  throw new Error('Reconnect loop exhausted');
}

async function startAutorunWithRetry(maxWaitMs = 180_000, retryIntervalMs = 5_000): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    try {
      log(`[Startup] Connect attempt ${attempt}...`);
      await startAutorun(/* silent */ true);
      return;
    } catch (err) {
      log(`[Startup] Attempt ${attempt} failed: ${err}. Retrying in ${retryIntervalMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryIntervalMs));
    }
  }
  statusBarUI?.setError(true);
  log('[Startup] Exhausted all retries. Showing error popup.');
  const config = vscode.workspace.getConfiguration('antigravityAutorun');
  const cdpPort = config.get<number>('cdpPort', 9222);
  const action = await vscode.window.showErrorMessage(
    'Antigravity Autorun: CDP connection failed. Restart Antigravity with CDP mode?',
    'Yes, Restart',
    'No'
  );
  if (action === 'Yes, Restart') {
    restartAntigravityWithCDP(cdpPort);
  }
}

async function toggleAutorun() {
  if (isEnabled) {
    await stopAutorun();
  } else {
    await startAutorun(false);
  }
}

async function startAutorun(silent = false) {
  if (!cdpConnection || !buttonClicker || !statusBarUI) return;

  try {
    statusBarUI.setConnecting(true);

    // 1순위: Antigravity의 chrome-devtools-mcp 확장에서 Chrome DevTools URL 가져오기
    try {
      const mcpUrl = await vscode.commands.executeCommand<string>('antigravity.getChromeDevtoolsMcpUrl');
      if (mcpUrl && typeof mcpUrl === 'string') {
        log(`[Autorun] Got Chrome DevTools URL from Antigravity: ${mcpUrl}`);
        cdpConnection.setExternalWsUrl(mcpUrl);
      }
    } catch (e) {
      // 커맨드 없음 — 무시하고 일반 연결 시도
    }

    await cdpConnection.connect();
    await buttonClicker.start();
    isEnabled = true;
    statusBarUI.setEnabled(true);
    log(`[Autorun] ON — connected to CDP port ${cdpConnection.getPort()}`);
    if (!silent) {
      vscode.window.showInformationMessage('Antigravity Autorun: ON');
    }
  } catch (error) {
    isEnabled = false;

    if (silent) {
      statusBarUI.setConnecting(true); // 계속 Connecting 표시 (재시도 중)
      throw error;
    }

    statusBarUI.setEnabled(false);
    statusBarUI.setError(true);
    log(`[Autorun] Failed to start: ${error}`);
    const config = vscode.workspace.getConfiguration('antigravityAutorun');
    const cdpPort = config.get<number>('cdpPort', 9222);
    const action = await vscode.window.showErrorMessage(
      'CDP connection failed. Restart Antigravity with CDP mode?',
      'Yes, Restart',
      'No'
    );
    if (action === 'Yes, Restart') {
      restartAntigravityWithCDP(cdpPort);
    }
  }
}

async function stopAutorun() {
  if (!buttonClicker || !statusBarUI) return;
  isEnabled = false;     // ★ 먼저 false — watchdog이 재연결 안 하게
  isReconnecting = false;
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

async function restartAntigravityWithCDP(port: number): Promise<void> {
  if (!statusBarUI) return;
  statusBarUI.setConnecting(true);
  log(`[Restart] Restarting Antigravity with --remote-debugging-port=${port}`);

  try {
    const antigravityPath = ANTIGRAVITY_PATHS.find(p => p && fs.existsSync(p)) ?? null;
    if (!antigravityPath) {
      throw new Error(`Antigravity not found. Tried: ${ANTIGRAVITY_PATHS.join(', ')}`);
    }
    log(`[Restart] Found Antigravity at: ${antigravityPath}`);

    // ★ 전략: Stop-Process 없이 두 단계로 재시작
    //   1) Antigravity가 종료되면 재시작하는 PS1 스크립트를 detached 프로세스로 먼저 실행
    //   2) VS Code의 workbench.action.quit으로 Antigravity를 정상 종료
    //   → PS1(detached)이 종료를 감지하고 CDP 플래그로 Antigravity를 재시작

    const tempScript = 'C:\\Windows\\Temp\\ag_restart_cdp.ps1';
    const scriptContent = [
      // Antigravity가 완전히 꺼질 때까지 대기
      `Start-Sleep -Seconds 3`,
      // Antigravity 프로세스가 아직 남아있으면 추가 대기
      `$maxWait = 15; $waited = 0`,
      `while ((Get-Process Antigravity -ErrorAction SilentlyContinue) -and ($waited -lt $maxWait)) { Start-Sleep -Seconds 1; $waited++ }`,
      // CDP 플래그로 재시작
      `Start-Process -FilePath "${antigravityPath}" -ArgumentList "--remote-debugging-port=${port}"`,
      `"Done" | Out-File C:\\Windows\\Temp\\ag_restart_log.txt`,
    ].join('\r\n');
    fs.writeFileSync(tempScript, scriptContent, 'utf8');
    log(`[Restart] Script written to ${tempScript}`);

    // detached 스폰 먼저 — VS Code quit 이전에 프로세스가 분리되도록
    const restartProc = spawn('powershell.exe', [
      '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
      '-File', tempScript,
    ], { detached: true, stdio: 'ignore', windowsHide: true });
    restartProc.on('error', (err) => {
      log(`[Restart] spawn failed: ${err.message}`);
      statusBarUI?.setError(true);
      vscode.window.showErrorMessage(`Restart failed: ${err.message}`);
    });
    restartProc.unref();

    log('[Restart] Detached restart process spawned. Quitting Antigravity cleanly...');
    vscode.window.showInformationMessage(
      `Antigravity를 CDP 모드(포트 ${port})로 재시작합니다. 잠시 후 자동 연결됩니다.`
    );

    // 잠시 후 VS Code를 정상 종료 → PS1이 재시작을 감지하여 CDP 플래그로 재실행
    await new Promise(resolve => setTimeout(resolve, 1500));
    await vscode.commands.executeCommand('workbench.action.quit');
    vscode.window.showInformationMessage(
      `Restarting Antigravity with CDP mode (port ${port}). Autorun will reconnect after restart.`
    );

  } catch (error) {
    statusBarUI.setConnecting(false);
    statusBarUI.setError(true);
    const message = error instanceof Error ? error.message : 'Unknown error';
    log(`[Restart] Error: ${message}`);
    vscode.window.showErrorMessage(`Restart failed: ${message}`);
  }
}

export async function deactivate() {
  isEnabled = false;
  if (watchdogInterval) clearInterval(watchdogInterval);
  try {
    if (buttonClicker) await buttonClicker.stop();
    if (cdpConnection) await cdpConnection.disconnect();
  } catch (error) {
    console.error('Error during deactivation:', error);
  }
  log('Antigravity Autorun deactivated');
}
