const CDP = require('chrome-remote-interface');

(async () => {
  try {
    const targets = await CDP.List({ port: 9222 });
    console.log('=== CDP Targets ===');
    targets.forEach(t => console.log(`- ${t.title} (${t.type})`));

    const launchpad = targets.find(t => t.title === 'Launchpad');
    if (!launchpad) {
      console.log('No Launchpad found');
      return;
    }

    console.log('\n=== Connecting to Launchpad ===');
    const client = await CDP({ port: 9222, target: launchpad });
    const { Runtime } = client;
    await Runtime.enable();

    // 버튼 찾기
    const result = await Runtime.evaluate({
      expression: `
        Array.from(document.querySelectorAll('button, [role="button"], span, div')).filter(el => {
          const text = (el.textContent || '').toLowerCase();
          return text.includes('run') || text.includes('accept') || text.includes('reject');
        }).slice(0, 20).map(el => ({
          tag: el.tagName,
          text: (el.textContent || '').trim().substring(0, 50),
          className: el.className,
          id: el.id
        }));
      `,
      returnByValue: true
    });

    console.log('\n=== Buttons Found ===');
    console.log(JSON.stringify(result.result.value, null, 2));

    await client.close();
  } catch (e) {
    console.error('Error:', e.message);
  }
})();
