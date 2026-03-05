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
