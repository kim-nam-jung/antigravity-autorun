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
