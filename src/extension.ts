import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as net from 'net';
import { CDPConnection, CDPConnectError, CDPConnectFailure, setCDPLogger, checkDevToolsPortStatus } from './cdp/connection';
import { ButtonClicker } from './buttons/clicker';
import { StatusBarUI } from './ui/statusBar';
import { findAntigravityPath } from './launcher/pathFinder';
import { isWSL } from './utils/os';
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

// ── 자동 재실행 (완전 자동 — 팝업 없음) ────────────────────────────────────────

/**
 * TCP 포트 열림 여부를 직접 확인한다 (DevToolsActivePort 파일 불필요).
 */
function isTcpPortOpen(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
    socket.connect(port, host);
  });
}

/**
 * Antigravity 경로를 탐지하여 CDP 모드로 자동 재실행한다.
 *
 * ⚠️ 핵심 설계: Extension은 Antigravity의 자식 프로세스이므로
 * 직접 taskkill → spawn 방식은 Antigravity 종료 시 Extension도
 * 같이 종료되어 spawn 명령이 실행되지 않는다.
 *
 * 해결책: 임시 PowerShell 스크립트를 작성하고 완전히 독립된
 * Start-Process로 실행한다. 이 스크립트는 Antigravity 프로세스 트리
 * 밖에서 실행되므로 Antigravity가 종료돼도 계속 실행된다.
 *
 * 최대 waitSec초 동안 포트가 열릴 때까지 폴링한 후 true/false 반환.
 */
async function autoRelaunchWithCDP(waitSec = 25): Promise<boolean> {
  log('[AutoRelaunch] CDP 미연결 — Antigravity 경로 탐색 중...');

  const found = await findAntigravityPath();
  if (!found.path) {
    log(`[AutoRelaunch] Antigravity 경로를 찾을 수 없음. 시도한 경로:\n${found.triedPaths.join('\n')}`);
    return false;
  }

  log(`[AutoRelaunch] Antigravity 경로: ${found.path} (via ${found.method})`);

  // 임시 PowerShell 스크립트 생성
  // Extension이 Antigravity 자식 프로세스이므로 직접 kill하면
  // Extension도 함께 종료됨. 독립 프로세스에 위임한다.
  const escaped = found.path.replace(/'/g, "''");
  const psScript = [
    `Start-Sleep -Milliseconds 1500`,
    `Stop-Process -Name Antigravity -Force -ErrorAction SilentlyContinue`,
    `Start-Sleep -Milliseconds 500`,
    `Start-Process -FilePath '${escaped}' -ArgumentList '--remote-debugging-port=9222' -WindowStyle Normal`,
  ].join('\n');

  const scriptName = `antigravity-cdp-relaunch-${Date.now()}.ps1`;

  // Windows 임시 디렉토리 경로(스크립트 실행용)와
  // WSL에서 직접 쓸 수 있는 경로를 분리
  let scriptPathWin: string;
  let scriptPathLocal: string; // fs.writeFileSync에 사용할 경로

  if (isWSL()) {
    // powershell에서 Windows TEMP 경로를 가져와 WSL 경로로 변환
    let winTemp = 'C:\\Windows\\Temp';
    try {
      const psOut = cp.execSync('powershell.exe -Command "$env:TEMP"', { encoding: 'utf8' }) as string;
      winTemp = psOut.trim();
    } catch { /* fallback */ }
    scriptPathWin = `${winTemp}\\${scriptName}`;
    // C:\Users\foo\... → /mnt/c/Users/foo/...
    scriptPathLocal = winTemp
      .replace(/^([A-Za-z]):\\/, (_, d) => `/mnt/${d.toLowerCase()}/`)
      .replace(/\\/g, '/') + '/' + scriptName;
  } else {
    scriptPathWin = path.join(os.tmpdir(), scriptName);
    scriptPathLocal = scriptPathWin;
  }

  // 스크립트 파일 작성 (WSL이든 Windows든 fs.writeFileSync 직접 사용)
  try {
    fs.writeFileSync(scriptPathLocal, psScript, 'utf8');
    log(`[AutoRelaunch] 스크립트 작성 완료: ${scriptPathLocal}`);
  } catch (err) {
    log(`[AutoRelaunch] 스크립트 파일 작성 실패: ${err}`);
    return false;
  }

  // 완전히 독립된 백그라운드 PowerShell 프로세스로 실행
  // (Antigravity 프로세스 트리 밖 → VS Code가 종료돼도 계속 실행됨)
  try {
    if (isWSL()) {
      // WSL: powershell.exe를 detached 없이 exec — 이미 별도 Windows 프로세스
      log(`[AutoRelaunch] 독립 PS 스크립트 실행 (WSL): ${scriptPathWin}`);
      cp.exec(`powershell.exe -WindowStyle Hidden -NonInteractive -ExecutionPolicy Bypass -File "${scriptPathWin}"`);
    } else {
      // Windows: Start-Process로 이중 래핑해 완전히 분리
      log(`[AutoRelaunch] 독립 PS 스크립트 실행 (Windows): ${scriptPathWin}`);
      const child = cp.spawn('powershell', [
        '-WindowStyle', 'Hidden',
        '-NonInteractive',
        '-Command',
        `Start-Process powershell -ArgumentList '-WindowStyle','Hidden','-NonInteractive','-ExecutionPolicy','Bypass','-File','${scriptPathWin}' -WindowStyle Hidden`,
      ], { detached: true, stdio: 'ignore' });
      child.unref();
    }
  } catch (err) {
    log(`[AutoRelaunch] 외부 프로세스 실행 실패: ${err}`);
    return false;
  }

  // 포트가 열릴 때까지 폴링 (DevToolsActivePort 파일 없이 TCP 직접 체크)
  const host = isWSL() ? '127.0.0.1' : '127.0.0.1';
  log(`[AutoRelaunch] 포트 9222 대기 중 (최대 ${waitSec}초)...`);
  for (let i = 0; i < waitSec; i++) {
    await delay(1000);
    const portOpen = await isTcpPortOpen(host, 9222);
    if (portOpen) {
      log(`[AutoRelaunch] ✔ CDP 포트 9222 열림!`);
      return true;
    }
    if (i < 3) {
      log(`[AutoRelaunch] 재시작 대기 중... (${i + 1}s)`);
    } else {
      log(`[AutoRelaunch] 대기 중... (${i + 1}/${waitSec}s)`);
    }
  }

  log('[AutoRelaunch] ✘ 타임아웃 — 포트가 열리지 않음');
  return false;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── 사용자 안내 (자동 재실행 먼저 시도) ────────────────────────────────────────

async function handleCDPConnectError(failure: CDPConnectFailure) {
  if (!statusBarUI) return;

  const reason = failure.reason;
  log(`[Autorun] CDP 연결 실패: ${reason} — 자동 재실행 시도 중...`);
  statusBarUI.setConnecting(true);

  // 자동 재실행 시도
  const relaunched = await autoRelaunchWithCDP();
  if (relaunched) {
    // 재실행 성공 → 다시 연결 시도
    try {
      await buttonClicker?.stop();
      await cdpConnection?.disconnect();
      await cdpConnection?.connect();
      await buttonClicker?.start();
      isEnabled = true;
      statusBarUI.setConnecting(false);
      statusBarUI.setEnabled(true);
      log('[AutoRelaunch] ✔ CDP 자동 재연결 완료! (API mode)');
      return;
    } catch (err) {
      log(`[AutoRelaunch] 재연결 실패: ${err}`);
    }
  }

  // 자동 재실행 실패 시 수동 안내 팝업
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
    'CDP 모드로 재실행',
    '설치 방법 보기',
    '진단 로그',
    '닫기'
  );

  if (selected === 'CDP 모드로 재실행') {
    await relaunchWithCDP();
  } else if (selected === '설치 방법 보기') {
    await showCDPSetupInstructions();
  } else if (selected === '진단 로그') {
    await diagnoseCDP();
  }
}

// ── 수동 재실행 (메뉴 명령) ───────────────────────────────────────────────────

async function relaunchWithCDP() {
  const confirm = await vscode.window.showInformationMessage(
    'Antigravity를 CDP 모드(--remote-debugging-port=9222)로 재실행합니다.',
    { modal: true },
    '재실행',
    '취소'
  );
  if (confirm !== '재실행') return;

  log('[Relaunch] 수동 재실행 시작...');
  statusBarUI?.setConnecting(true);

  const relaunched = await autoRelaunchWithCDP(25);
  if (relaunched) {
    try {
      await buttonClicker?.stop();
      await cdpConnection?.disconnect();
      await cdpConnection?.connect();
      await buttonClicker?.start();
      isEnabled = true;
      statusBarUI?.setConnecting(false);
      statusBarUI?.setEnabled(true);
      log('[Relaunch] ✔ 재실행 및 CDP 연결 완료! (API mode)');
      vscode.window.showInformationMessage('Antigravity Autorun: CDP 연결 완료!');
      return;
    } catch (err) {
      log(`[Relaunch] 재연결 실패: ${err}`);
    }
  }

  statusBarUI?.setConnecting(false);
  statusBarUI?.setNeedsSetup(true);
  const pathResult = await findAntigravityPath();
  vscode.window.showErrorMessage(
    `자동 재실행 실패. Antigravity 경로: ${pathResult.path ?? '찾을 수 없음'}. 수동으로 실행하고 Reconnect CDP를 눌러주세요.`
  );
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
