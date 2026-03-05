import * as vscode from 'vscode';
import * as cp from 'child_process';
import { CDPConnection, CDPConnectError, CDPConnectFailure, setCDPLogger, checkDevToolsPortStatus } from './cdp/connection';
import { ButtonClicker } from './buttons/clicker';
import { StatusBarUI } from './ui/statusBar';
import { findAntigravityPath } from './launcher/pathFinder';
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
    vscode.commands.registerCommand('antigravity-autorun.showSetupInstructions', () => showCDPSetupInstructions()),
    vscode.commands.registerCommand('antigravity-autorun.relaunchWithCDP', () => relaunchWithCDP()),
    vscode.commands.registerCommand('antigravity-autorun.enableCDPNatively', () => enableCDPNatively()),
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

// ── 진단 ──────────────────────────────────────────────────────────────────────

async function diagnoseCDP() {
  outputChannel.show(true);
  log('=== CDP Diagnosis ===');

  // 1) DevToolsActivePort 파일 + 포트 생존 여부
  const status = await checkDevToolsPortStatus();
  log(`[Diag] DevToolsActivePort: ${status.fileFound ? `found (port=${status.port})` : 'NOT found'}`);
  if (status.fileFound) {
    log(`[Diag] Port ${status.port} listening: ${status.portListening}`);
    if (status.stale) {
      log('[Diag] ⚠ STALE: 파일이 존재하지만 포트가 닫혀 있습니다.');
    } else {
      log('[Diag] ✔ 포트가 활성 상태입니다.');
    }
  } else {
    log('[Diag] ⚠ DevToolsActivePort 파일이 없습니다.');
  }

  // 2) Antigravity 프로세스 생존 여부
  const running = await isAntigravityProcessRunning();
  log(`[Diag] Antigravity 프로세스: ${running ? '실행 중 ✔' : '감지 안 됨 ✘'}`);

  // 3) Antigravity 경로 탐색
  const pathResult = await findAntigravityPath();
  log(`[Diag] Antigravity 경로: ${pathResult.path ?? 'NOT FOUND'} (via ${pathResult.method})`);

  // 4) 포트 스캔
  const ports = [9222, 9223, 9224, 9225, 9229, 9333];
  log('[Diag] --- 포트 스캔 ---');
  for (const port of ports) {
    try {
      const targets = await Promise.race([
        CDP.List({ port }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
      ]);
      log(`[Diag] Port ${port}: ${(targets as any[]).length}개 타겟 발견`);
      (targets as any[]).forEach((t: any) => {
        log(`  → [${t.type}] "${t.title}" | ${t.url}`);
      });
    } catch {
      log(`[Diag] Port ${port}: 사용 불가`);
    }
  }

  log('=== End Diagnosis ===');
}

// ── 프로세스 감지 ──────────────────────────────────────────────────────────────

function isAntigravityProcessRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const cmd = process.platform === 'linux'
      ? 'tasklist.exe 2>/dev/null | grep -i antigravity'
      : 'tasklist /FI "IMAGENAME eq Antigravity*" 2>nul';

    cp.exec(cmd, (err, stdout) => {
      if (err) { resolve(false); return; }
      resolve(stdout.toLowerCase().includes('antigravity'));
    });
  });
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── 사용자 안내 (AI MCP 프롬프트 복사) ────────────────────────────────────────

async function handleCDPConnectError(failure: CDPConnectFailure) {
  if (!statusBarUI) return;

  const reason = failure.reason;
  log(`[Autorun] CDP 연결 실패: ${reason}`);
  statusBarUI.setConnecting(false);
  statusBarUI.setNeedsSetup(true);

  let message: string;
  if (reason === 'stale_port_file') {
    message = 'Antigravity Autorun: CDP가 비활성화되어 있습니다. (포트 닫힘)';
  } else if (reason === 'no_port_file') {
    message = 'Antigravity Autorun: CDP가 비활성화되어 있습니다. (--remote-debugging-port 플래그 필요)';
  } else {
    message = `Antigravity Autorun: CDP 연결 실패 (port=${failure.port})`;
  }

  log(`[Autorun] ${message}`);

  const selected = await vscode.window.showWarningMessage(
    message,
    'AI에게 MCP 실행 요청',
    '설치 방법 보기',
    '진단 로그',
    '닫기'
  );

  if (selected === 'AI에게 MCP 실행 요청') {
    await vscode.env.clipboard.writeText('Please run mcp_antigravity-powershell_launch_antigravity_cdp to start my editor in CDP mode.');
    vscode.window.showInformationMessage('프롬프트가 복사되었습니다. AI 채팅창에 붙여넣어 에디터를 재실행하세요.');
  } else if (selected === '설치 방법 보기') {
    await showCDPSetupInstructions();
  } else if (selected === '진단 로그') {
    await diagnoseCDP();
  }
}

// ── 자동 실행 (CDP Native Launch) ──────────────────────────────────────────────

async function enableCDPNatively() {
  if (statusBarUI) {
    statusBarUI.setConnecting(true);
  }
  
  const pathResult = await findAntigravityPath();
  const exePath = pathResult.path;
  const config = vscode.workspace.getConfiguration('antigravityAutorun');
  const cdpPort = config.get<number>('cdpPort', 9222);

  if (!exePath) {
    vscode.window.showErrorMessage('Antigravity 실행 파일을 찾을 수 없습니다. 경로 설정이나 환경 변수를 확인해주세요.');
    if (statusBarUI) statusBarUI.setNeedsSetup(true);
    return;
  }

  log(`[Launcher] Launching Antigravity with CDP using port ${cdpPort}...`);
  log(`[Launcher] Executable Path: ${exePath}`);

  const psCommand = `& "${exePath}" --user-data-dir="$env:LOCALAPPDATA\\Temp\\AgCDPProfile" --remote-debugging-port=${cdpPort}`;

  try {
    const cleanEnv = { ...process.env };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;

    const agProcess = cp.spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand], {
      detached: true,
      stdio: 'ignore',
      env: cleanEnv
    });
    agProcess.unref();

    log(`[Launcher] Process spawned successfully.`);
    vscode.window.showInformationMessage(`Antigravity가 포트 ${cdpPort}에서 CDP와 함께 실행되었습니다. 곧 자동 연결을 시도합니다...`);

    // Give it some time to start up before reconnecting
    setTimeout(() => {
      reconnectCDP().catch(err => {
        log(`[Launcher] Auto-reconnect failed: ${err}`);
      });
    }, 2000);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log(`[Launcher] Failed to launch CDP: ${message}`);
    vscode.window.showErrorMessage(`Failed to launch CDP: ${message}`);
    if (statusBarUI) statusBarUI.setNeedsSetup(true);
  }
}

// ── 수동 재실행 (메뉴 명령) ───────────────────────────────────────────────────

async function relaunchWithCDP() {
  const confirm = await vscode.window.showInformationMessage(
    'AI를 통해 Antigravity를 CDP 모드로 재실행하기 위한 프롬프트를 복사하시겠습니까?',
    { modal: true },
    '복사하기',
    '취소'
  );
  if (confirm !== '복사하기') return;

  await vscode.env.clipboard.writeText('Please run mcp_antigravity-powershell_launch_antigravity_cdp to start my editor in CDP mode.');
  vscode.window.showInformationMessage('프롬프트가 복사되었습니다. AI 채팅창에 붙여넣어 에디터를 재실행하세요.');
}

async function showCDPSetupInstructions() {
  const content = [
    '# Antigravity Autorun — CDP 설정 가이드',
    '',
    'Antigravity Autorun 확장이 동작하려면 Antigravity(VSCode 포크)가',
    '원격 디버깅 포트를 열고 실행되어야 합니다.',
    '',
    '---',
    '',
    '## 방법 1: 바탕화면 바로가기 수정 (권장)',
    '',
    '1. 바탕화면의 Antigravity 바로가기 아이콘을 **우클릭**합니다.',
    '2. **속성(Properties)** 을 클릭합니다.',
    '3. **대상(Target)** 필드 맨 끝에 다음을 추가합니다:',
    '',
    '   --remote-debugging-port=9222',
    '',
    '   예시:',
    '   "C:\\\\Users\\\\skawn\\\\AppData\\\\Local\\\\Programs\\\\Antigravity\\\\Antigravity.exe" --remote-debugging-port=9222',
    '',
    '4. **확인**을 클릭하고 Antigravity를 **재시작**합니다.',
    '',
    '---',
    '',
    '## 방법 2: PowerShell에서 직접 실행',
    '',
    '```powershell',
    '& "$env:LOCALAPPDATA\\Programs\\Antigravity\\Antigravity.exe" --remote-debugging-port=9222',
    '```',
    '',
    '---',
    '',
    '## 검증 방법',
    '',
    'Antigravity 실행 후 브라우저에서 다음 URL 접속:',
    '',
    '  http://localhost:9222/json',
    '',
    '페이지 타겟 목록 JSON이 보이면 성공입니다.',
    '',
  ].join('\n');

  const doc = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
  await vscode.window.showTextDocument(doc, { preview: true });
}

// ── Autorun 제어 ──────────────────────────────────────────────────────────────

async function toggleAutorun() {
  if (isEnabled) {
    await stopAutorun();
  } else {
    await startAutorun();
  }
}

const MAX_RETRY = 5;
const RETRY_DELAY_MS = 5000;

async function startAutorun() {
  if (!cdpConnection || !buttonClicker || !statusBarUI) return;

  statusBarUI.setConnecting(true);

  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      await cdpConnection.connect();
      await buttonClicker.start();
      isEnabled = true;
      statusBarUI.setEnabled(true);
      log(`[Autorun] ON (API mode) — connected to CDP port ${cdpConnection.getPort()}`);
      return;
    } catch (error) {
      // CDPConnectError: 영구적 실패 → 자동 재실행 시도
      if (error instanceof CDPConnectError) {
        const reason = error.failure.reason;
        isEnabled = false;
        statusBarUI.setConnecting(false);
        log(`[Autorun] CDP failure (${reason}) — attempting auto-relaunch`);
        await handleCDPConnectError(error.failure);
        return;
      }

      // 일시적 실패 → 재시도
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (attempt < MAX_RETRY) {
        log(`[Autorun] CDP connect failed (attempt ${attempt}/${MAX_RETRY}): ${message}. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await delay(RETRY_DELAY_MS);
      } else {
        isEnabled = false;
        statusBarUI.setEnabled(false);
        statusBarUI.setError(true);
        log(`[Autorun] Failed to start after ${MAX_RETRY} attempts: ${message}`);
        vscode.window.showErrorMessage(
          `CDP connection failed after ${MAX_RETRY} attempts: ${message}. Antigravity가 실행 중인지 확인하세요.`
        );
      }
    }
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
  statusBarUI.setNeedsSetup(false);
  log('[Reconnect] Manual reconnect triggered');
  try {
    await buttonClicker.stop();
    await cdpConnection.disconnect();
    await cdpConnection.connect();
    await buttonClicker.start();
    isEnabled = true;
    statusBarUI.setConnecting(false);
    statusBarUI.setEnabled(true);
    log('[Reconnect] Manual reconnect success (API mode)');
    vscode.window.showInformationMessage('CDP reconnected');
  } catch (error) {
    statusBarUI.setConnecting(false);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (error instanceof CDPConnectError) {
      await handleCDPConnectError(error.failure);
    } else {
      statusBarUI.setError(true);
      isEnabled = false;
      log(`[Reconnect] Manual reconnect failed: ${message}`);
      vscode.window.showErrorMessage(`CDP reconnection failed: ${message}`);
    }
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
