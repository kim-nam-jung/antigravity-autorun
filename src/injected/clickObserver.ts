/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

interface BlockListConfig {
  delay: number;
  autoScroll: boolean;
  blockedCommands: string[];
}

interface Window {
  __antigravityAutorunConfig?: BlockListConfig;
  __antigravityAutorunObserver?: MutationObserver | null;
  __antigravityAutorunScan?: () => void;
}

(() => {
  // Clean up any previous observer
  if (window.__antigravityAutorunObserver) {
    window.__antigravityAutorunObserver.disconnect();
  }

  const CONFIG = window.__antigravityAutorunConfig || {
    delay: 100,
    autoScroll: true,
    blockedCommands: [],
  };

  // Allow-specific patterns — always click these regardless of dialog context
  const ALLOW_PATTERNS = [
    /^allow once$/i,
    /^allow this conversation$/i,
    /^allow$/i,
    /^allow always$/i,
    /^yes$/i,
    /^approve$/i,
  ];

  // General button patterns
  const BUTTON_PATTERNS = [
    /\brun\b/i,
    /\bretry\b/i,
    /\bconfirm\b/i,
    /\bexecute\b/i,
    /\bapprove\b/i,
  ];

  const EXCLUDE_PATTERNS = [
    /^always run/i,
    /run button/i,
    /retry button/i,
    /auto click settings/i,
  ];

  // Negative button patterns
  const NEGATIVE_PATTERNS = [
    /^reject$/i,
    /^decline$/i,
    /^cancel$/i,
    /^no$/i,
    /^don'?t run/i,
    /^skip$/i,
    /^deny$/i,
    /^block$/i,
  ];

  function isCommandBlocked(element: HTMLElement): boolean {
    const parent = element.closest('[class*="command-body"], [class*="prompt"]');
    if (!parent) return false;
    const commandText = parent.textContent || '';
    return CONFIG.blockedCommands.some((blocked: string) =>
      commandText.toLowerCase().includes(blocked.toLowerCase())
    );
  }

  function isInRunCommandDialog(element: HTMLElement): boolean {
    let container = element.parentElement;
    for (let i = 0; i < 15 && container; i++) {
      const siblings = container.querySelectorAll(
        'button, [role="button"], .cursor-pointer, vscode-button'
      );
      const hasNegativeButton = Array.from(siblings).some((s) =>
        s !== element && NEGATIVE_PATTERNS.some((p) => p.test((s.textContent || '').trim()))
      );
      if (hasNegativeButton) {
        console.log('[Autorun] Found negative button sibling in parent depth:', i);
        return true;
      }
      container = container.parentElement;
    }

    const nearbyText = (element.closest('[class*="dialog"], [class*="modal"], [class*="prompt"], [class*="confirm"], [class*="command"]') || element.parentElement || element)?.textContent || '';
    if (/run command|execute|proceed|confirm run/i.test(nearbyText)) return true;

    return false;
  }

  function isTargetButton(element: HTMLElement): boolean {
    if (!element) return false;

    if (element.closest && element.closest(
      '.part.sidebar, .part.activitybar, .part.panel, ' +
      '.monaco-list-row, .monaco-tl-row, ' +
      '.pane-body, .split-view-view .pane-body'
    )) {
      return false;
    }

    if (
      (element as any).disabled ||
      element.getAttribute('disabled') !== null ||
      element.getAttribute('aria-disabled') === 'true' ||
      (element.closest && element.closest('[disabled]')) ||
      (element.closest && element.closest('[aria-disabled="true"]')) ||
      (element.getBoundingClientRect && element.getBoundingClientRect().width === 0) ||
      (window.getComputedStyle && window.getComputedStyle(element).visibility === 'hidden')
    ) {
      return false;
    }

    const tagName = element.tagName?.toLowerCase();
    const role = element.getAttribute('role');
    const rawText = (element.textContent || '').trim();
    const text = [
      rawText,
      element.getAttribute('aria-label') || '',
      element.getAttribute('title') || '',
    ].join(' ').trim();

    if (ALLOW_PATTERNS.some(p => p.test(rawText))) {
      console.log('[Autorun] Allow button detected:', rawText);
      return true;
    }

    const isClickable =
      tagName === 'button' ||
      tagName === 'vscode-button' ||
      role === 'button' ||
      (element.classList && element.classList.contains('cursor-pointer')) ||
      (element.classList && element.classList.contains('monaco-button')) ||
      (element.classList && element.classList.contains('monaco-text-button')) ||
      (window.getComputedStyle && window.getComputedStyle(element).cursor === 'pointer');

    if (!isClickable) return false;
    if (!BUTTON_PATTERNS.some(p => p.test(text))) return false;
    if (EXCLUDE_PATTERNS.some(p => p.test(text))) return false;

    if (/\brun\b/i.test(text) && !/\bretry\b/i.test(text)) {
      if (!isInRunCommandDialog(element)) {
        console.log('[Autorun] Run button found but NOT in dialog, skipping:', text);
        return false;
      }
    }

    if (isCommandBlocked(element)) {
      console.log('[Autorun] Blocked command, skipping');
      return false;
    }

    return true;
  }

  function clickButton(button: HTMLElement) {
    const scrollableContainer = (button.closest ? button.closest('.overflow-y-auto, .scrollable, main, .chat-thread') : null) || document.querySelector('.overflow-y-auto, main');
    if (scrollableContainer) {
      try { scrollableContainer.scrollTop = scrollableContainer.scrollHeight; } catch(e) {}
    }

    const downArrows = document.querySelectorAll('button[title*="bottom" i], button[aria-label*="bottom" i], .scroll-bottom-button, button svg path[d*="M16.59 8.59L12 13.17 7.41 8.59"]');
    downArrows.forEach(arrow => {
      const btn = arrow.closest ? arrow.closest('button') || arrow : arrow;
      if (btn && typeof (btn as any).click === 'function' && window.getComputedStyle(btn as Element).visibility !== 'hidden') {
        try { (btn as any).click(); console.log('[Autorun] Clicked scroll-down arrow'); } catch(e) {}
      }
    });

    if (CONFIG.autoScroll) {
      try { button.scrollIntoView({ behavior: 'instant', block: 'end' }); } catch(e) {}
    }

    setTimeout(() => {
      console.log('[Autorun] Clicking:', button.textContent?.trim() || button.tagName);

      const rect = button.getBoundingClientRect();
      const opts = { 
        bubbles: true, 
        cancelable: true, 
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      };
      
      button.dispatchEvent(new PointerEvent('pointerdown', opts));
      button.dispatchEvent(new MouseEvent('mousedown', opts));
      button.dispatchEvent(new PointerEvent('pointerup', opts));
      button.dispatchEvent(new MouseEvent('mouseup', opts));
      button.click();

      console.log('[Autorun] Click dispatched.');
    }, CONFIG.delay + 100);
  }

  const clickQueue: HTMLElement[] = [];
  let queueRunning = false;

  function processQueue() {
    if (queueRunning || clickQueue.length === 0) return;
    queueRunning = true;

    const button = clickQueue.shift();
    if (!button) {
      queueRunning = false;
      return;
    }

    if (document.body.contains(button) && button.getBoundingClientRect().width > 0) {
      clickButton(button);
      setTimeout(() => {
        queueRunning = false;
        processQueue();
      }, CONFIG.delay + 50);
    } else {
      queueRunning = false;
      processQueue();
    }
  }

  function enqueueClick(button: HTMLElement) {
    if (!clickQueue.includes(button)) {
      clickQueue.push(button);
      processQueue();
    }
  }

  function scanForButtons() {
    const candidates = document.querySelectorAll(
      'button, vscode-button, [role="button"], span, div, a, li, .notification-action, .action-label'
    );
    candidates.forEach((el) => {
      if (isTargetButton(el as HTMLElement)) enqueueClick(el as HTMLElement);
    });
  }

  const observerProcess = (mutations: MutationRecord[]) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        const target = mutation.target as HTMLElement;
        if (target.nodeType === Node.ELEMENT_NODE && isTargetButton(target)) {
          enqueueClick(target);
        }
        continue;
      }

      if (mutation.type === 'childList') {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (isTargetButton(node as HTMLElement)) enqueueClick(node as HTMLElement);

          const el = node as HTMLElement;
          if (el.querySelectorAll) {
             el.querySelectorAll('button, vscode-button, [role="button"]')
              .forEach(btn => { if (isTargetButton(btn as HTMLElement)) enqueueClick(btn as HTMLElement); });
          }
        }
      }
    }
  };

  window.__antigravityAutorunObserver = new MutationObserver(observerProcess);

  window.__antigravityAutorunObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'aria-disabled', 'class'],
  });

  window.__antigravityAutorunScan = scanForButtons;
  scanForButtons();

  console.log('[Autorun] Observer active (injected bundle)');
})();
