const CDP = require('chrome-remote-interface');

async function run() {
  let pageClient = null;
  try {
    const fs = require('fs');
    let devToolsPort = null;
    let wsPath = null;
    try { 
      const content = fs.readFileSync('/mnt/c/Users/skawn/AppData/Roaming/Antigravity/DevToolsActivePort', 'utf8').split('\\n');
      devToolsPort = parseInt(content[0].trim(), 10);
      wsPath = content[1].trim();
    } catch(e){}
    
    if (!devToolsPort) {
      console.log('No DevToolsActivePort found');
      return;
    }

    const host = '127.0.0.1';
    const port = devToolsPort;
    const wsUrl = `ws://${host}:${port}${wsPath}`;
    
    console.log('Connecting to browser:', wsUrl);
    const browserClient = await CDP({ target: wsUrl });
    const { targetInfos } = await browserClient.Target.getTargets();
    
    const target =
        targetInfos.find((t) => t.type === 'page' && t.url?.includes('workbench.html')) ||
        targetInfos.find((t) => t.type === 'page' && t.title === 'Launchpad') ||
        targetInfos.find((t) => t.type === 'page' && t.url?.includes('jetski-agent')) ||
        targetInfos.find((t) =>
          t.type === 'page' &&
          !t.url?.startsWith('devtools://') &&
          !t.url?.startsWith('chrome-extension://') &&
          !t.url?.startsWith('about:')
        );
        
    if (!target) {
      console.log('No suitable page target found');
      return;
    }
    
    console.log('Connecting to target:', target.title, target.url);
    const pageWsUrl = `ws://${host}:${port}/devtools/page/${target.targetId}`;
    pageClient = await CDP({ target: pageWsUrl });
    await pageClient.Runtime.enable();
    await pageClient.DOM.enable();
    
    const getButtonsScript = `
      Array.from(document.querySelectorAll('button, vscode-button, [role="button"], .cursor-pointer'))
        .filter(el => {
          const text = (el.textContent || '').trim();
          return text.length > 0 && text.length < 50;
        })
        .map(b => ({
          tag: b.tagName,
          text: (b.textContent || '').trim(),
          className: b.className,
          visible: b.getBoundingClientRect().width > 0,
          disabled: b.disabled || b.getAttribute('aria-disabled') === 'true',
          parentClass: b.parentElement ? b.parentElement.className : '',
          grandparentClass: b.parentElement?.parentElement ? b.parentElement.parentElement.className : ''
        }))
    `;
    
    const { result } = await pageClient.Runtime.evaluate({ expression: getButtonsScript, returnByValue: true });
    console.log(JSON.stringify(result.value, null, 2));
    
    const checkScript = `
      typeof window.__antigravityAutorunScan === 'function' ? 'Injected' : 'Not injected'
    `;
    const checkResult = await pageClient.Runtime.evaluate({ expression: checkScript, returnByValue: true });
    console.log('Autorun script status:', checkResult.result.value);
    
    await browserClient.close();
  } catch (err) {
    console.error(err);
  } finally {
    if (pageClient) await pageClient.close();
  }
}

run();
