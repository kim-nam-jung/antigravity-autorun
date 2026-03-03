/**
 * Antigravity Autorun - 버튼 클릭 테스트
 * 실행: node test-click.js
 */
const CDP = require('chrome-remote-interface');
const PORTS = [9222, 9223, 9224, 9225];

async function findTarget(port) {
  try {
    const targets = await Promise.race([
      CDP.List({ port }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    console.log(`\n[Port ${port}] 타겟 목록:`);
    targets.forEach(t => console.log(`  [${t.type}] "${t.title}" | ${t.url.slice(0, 80)}`));

    // workbench.html이 실제 UI 페이지
    return targets.find(t => t.type === 'page' && t.url?.includes('workbench.html'))
        || targets.find(t => t.type === 'page' && !t.url?.startsWith('about:') && !t.url?.includes('devtools://'));
  } catch { return null; }
}

async function evaluate(client, expression) {
  const res = await client.Runtime.evaluate({ expression, returnByValue: true });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || 'Script error');
  }
  return res.result?.value;
}

async function main() {
  console.log('🔍 Antigravity CDP 연결 시도 중...');

  let foundPort = null, foundTarget = null;
  for (const port of PORTS) {
    const t = await findTarget(port);
    if (t) { foundPort = port; foundTarget = t; break; }
  }

  if (!foundTarget) {
    console.error('\n❌ Antigravity를 찾을 수 없습니다. CDP 모드로 실행 중인지 확인하세요.');
    process.exit(1);
  }
  console.log(`\n✅ 연결: "${foundTarget.title}" (port ${foundPort})`);

  const client = await CDP({ host: 'localhost', port: foundPort, target: foundTarget });
  await client.Runtime.enable();

  // 테스트 다이얼로그 주입
  console.log('\n💉 Run/Reject 테스트 다이얼로그 주입 중...');
  try {
    const injectResult = await evaluate(client, `
      (function() {
        const existing = document.getElementById('__autorun_test_dialog');
        if (existing) existing.remove();

        const dialog = document.createElement('div');
        dialog.id = '__autorun_test_dialog';
        dialog.style.cssText = 'position:fixed;top:60px;right:60px;z-index:9999999;background:#1e1e1e;border:2px solid #007acc;border-radius:8px;padding:16px;font-family:monospace;font-size:14px;color:#ccc;box-shadow:0 4px 20px rgba(0,0,0,0.5);min-width:280px;';
        dialog.innerHTML = \`
          <div style="margin-bottom:10px;color:#569cd6;font-weight:bold;">🧪 Autorun Test</div>
          <div style="margin-bottom:12px;">Run command: <span style="color:#ce9178">echo hello</span></div>
          <div style="display:flex;gap:8px;">
            <button id="__test_run" style="background:#007acc;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px;">Run</button>
            <button id="__test_reject" style="background:#444;color:#ccc;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px;">Reject</button>
          </div>
          <div id="__test_status" style="margin-top:10px;min-height:18px;"></div>
        \`;
        document.body.appendChild(dialog);

        window.__autorunTestClicked = false;
        document.getElementById('__test_run').addEventListener('click', () => {
          window.__autorunTestClicked = true;
          document.getElementById('__test_status').innerHTML = '✅ Run 클릭됨!';
          console.log('[TEST] ✅ Run button clicked by Autorun!');
        });
        document.getElementById('__test_reject').addEventListener('click', () => {
          document.getElementById('__test_status').innerHTML = '⛔ Reject 클릭됨';
        });
        return 'ok';
      })();
    `);
    console.log(`   주입 결과: ${injectResult}`);
  } catch (err) {
    console.error('   주입 실패:', err.message);
    await client.close();
    process.exit(1);
  }

  console.log('\n⏳ Autorun이 Run 버튼을 클릭할 때까지 대기 (최대 10초)...\n');

  let clicked = false;
  for (let i = 1; i <= 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const status = await evaluate(client, `window.__autorunTestClicked`);
      process.stdout.write(`\r   [${(i * 0.5).toFixed(1)}s] 상태: ${status ? '✅ CLICKED' : '⏳ waiting...'}`);
      if (status === true) { clicked = true; break; }
    } catch { /* 연결 끊김 등 무시 */ }
  }

  console.log('\n');
  if (clicked) {
    console.log('🎉 성공! Autorun이 Run 버튼을 자동 클릭했습니다!');
  } else {
    console.log('⚠️  10초 내에 클릭되지 않았습니다.');
    console.log('   → Antigravity UI에서 직접 다이얼로그가 보이는지 확인해보세요.');
    console.log('   → isInRunCommandDialog() 조건: Reject 시블링 버튼 필요');
  }

  await evaluate(client, `document.getElementById('__autorun_test_dialog')?.remove()`).catch(() => {});
  await client.close();
}

main().catch(err => { console.error('오류:', err.message); process.exit(1); });
