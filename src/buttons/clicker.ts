import * as vscode from 'vscode';
import { CDPConnection } from '../cdp/connection';

export class ButtonClicker {
  private connection: CDPConnection;
  private config: vscode.WorkspaceConfiguration;
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(connection: CDPConnection, config: vscode.WorkspaceConfiguration) {
    this.connection = connection;
    this.config = config;
  }

  updateConfig(config: vscode.WorkspaceConfiguration): void {
    this.config = config;
  }

  async start(): Promise<void> {
    // 이전 상태 초기화 — 에러나 예외 종료 후에도 항상 깨끗하게 시작
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    this.isRunning = true;
    try {
      await this.injectObserver();
      this.startPolling();
    } catch (error) {
      console.error('Failed to start button clicker:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    await this.removeObserver();
  }

  /** CDP 재연결 후 observer를 새 타겟에 다시 주입할 때 사용 */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  private async injectObserver(): Promise<void> {
    const delay = this.config.get<number>('delay', 100);
    const autoScroll = this.config.get<boolean>('autoScroll', true);
    const blockedCommands = this.config.get<string[]>('blockedCommands', []);

    const script = `
      // Clean up any previous observer
      if (window.__antigravityAutorunObserver) {
        window.__antigravityAutorunObserver.disconnect();
      }

      const CONFIG = {
        delay: ${delay},
        autoScroll: ${autoScroll},
        blockedCommands: ${JSON.stringify(blockedCommands)},
      };

      // Allow-specific patterns — always click these regardless of dialog context
      const ALLOW_PATTERNS = [
        /^allow once$/i,
        /^allow this conversation$/i,
        /^allow$/i,
        /^allow always$/i,
      ];

      // General button patterns
      const BUTTON_PATTERNS = [
        /\\brun\\b/i,
        /\\bretry\\b/i,
        /\\baccept(\\s|$|\\b)/i,
        /\\bconfirm\\b/i,
      ];

      const EXCLUDE_PATTERNS = [
        /^always run/i,
        /run button/i,
        /retry button/i,
        /accept\\/allow/i,
        /auto click settings/i,
      ];

      // Negative button patterns — if ANY sibling matches, the dialog has a cancel option
      // which means this IS a confirmation dialog for "Run"
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

      function isCommandBlocked(element) {
        const parent = element.closest('[class*="command-body"], [class*="prompt"]');
        if (!parent) return false;
        const commandText = parent.textContent || '';
        return CONFIG.blockedCommands.some(blocked =>
          commandText.toLowerCase().includes(blocked.toLowerCase())
        );
      }

      // Check if "Run" button is inside a confirmation dialog.
      // A dialog is detected when any sibling button has a "negative" label
      // (Reject / Decline / Cancel / No / Don't run / etc.).
      function isInRunCommandDialog(element) {
        // Walk up to find a container that acts as a dialog/group
        // Try up to 5 levels to accommodate various DOM structures
        let container = element.parentElement;
        for (let i = 0; i < 5 && container; i++) {
          const siblings = container.querySelectorAll(
            'button, [role="button"], .cursor-pointer, vscode-button'
          );
          const hasNegativeButton = Array.from(siblings).some(s =>
            s !== element && NEGATIVE_PATTERNS.some(p => p.test((s.textContent || '').trim()))
          );
          if (hasNegativeButton) return true;
          container = container.parentElement;
        }

        // Fallback: check if there's any text near the button that hints at a command dialog
        // e.g. "Run command?", "Execute?", "Proceed?" in surrounding text
        const nearbyText = (element.closest('[class*="dialog"], [class*="modal"], [class*="prompt"], [class*="confirm"], [class*="command"]') || element.parentElement || element)?.textContent || '';
        if (/run command|execute|proceed|confirm run/i.test(nearbyText)) return true;

        return false;
      }

      function isTargetButton(element) {
        if (!element) return false;

        // Skip disabled / invisible
        if (
          element.disabled ||
          element.getAttribute('disabled') !== null ||
          element.getAttribute('aria-disabled') === 'true' ||
          element.closest('[disabled]') ||
          element.closest('[aria-disabled="true"]') ||
          element.getBoundingClientRect().width === 0 ||
          getComputedStyle(element).visibility === 'hidden'
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

        // Allow-specific buttons: match by text alone, no isClickable check needed
        if (ALLOW_PATTERNS.some(p => p.test(rawText))) {
          console.log('[Autorun] Allow button detected:', rawText);
          return true;
        }

        const isClickable =
          tagName === 'button' ||
          tagName === 'vscode-button' ||
          role === 'button' ||
          element.classList.contains('cursor-pointer') ||
          element.classList.contains('monaco-button') ||
          element.classList.contains('monaco-text-button') ||
          getComputedStyle(element).cursor === 'pointer';

        if (!isClickable) return false;
        if (!BUTTON_PATTERNS.some(p => p.test(text))) return false;
        if (EXCLUDE_PATTERNS.some(p => p.test(text))) return false;

        // "run" pattern: only click if inside Antigravity's "Run command?" dialog
        if (/\\brun\\b/i.test(text) && !/\\bretry\\b/i.test(text)) {
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

      function clickButton(button) {
        if (CONFIG.autoScroll) {
          try { button.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch(e) {}
        }

        setTimeout(() => {
          console.log('[Autorun] Clicking:', button.textContent?.trim() || button.tagName);

          // Supplement with mousedown/up for listeners that need them,
          // then use native .click() as the definitive trigger.
          const opts = { bubbles: true, cancelable: true, view: window };
          button.dispatchEvent(new MouseEvent('mousedown', opts));
          button.dispatchEvent(new MouseEvent('mouseup', opts));
          button.click();

          console.log('[Autorun] Click dispatched.');
        }, CONFIG.delay);
      }

      // --- Queue with correct timing ---
      const clickQueue = [];
      let queueRunning = false;

      function processQueue() {
        if (queueRunning || clickQueue.length === 0) return;
        queueRunning = true;

        const button = clickQueue.shift();

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

      function enqueueClick(button) {
        if (!clickQueue.includes(button)) {
          clickQueue.push(button);
          processQueue();
        }
      }

      function scanForButtons() {
        // Include span/div/a/li for Antigravity custom components and notification actions
        const candidates = document.querySelectorAll(
          'button, vscode-button, [role="button"], span, div, a, li, .notification-action, .action-label'
        );
        candidates.forEach(el => {
          if (isTargetButton(el)) enqueueClick(el);
        });
      }

      window.__antigravityAutorunObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes') {
            const target = mutation.target;
            if (target.nodeType === Node.ELEMENT_NODE && isTargetButton(target)) {
              enqueueClick(target);
            }
            continue;
          }

          if (mutation.type === 'childList') {
            for (const node of mutation.addedNodes) {
              if (node.nodeType !== Node.ELEMENT_NODE) continue;
              if (isTargetButton(node)) enqueueClick(node);

              node.querySelectorAll?.('button, vscode-button, [role="button"]')
                .forEach(btn => { if (isTargetButton(btn)) enqueueClick(btn); });
            }
          }
        }
      });

      window.__antigravityAutorunObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'aria-disabled', 'class'],
      });

      window.__antigravityAutorunScan = scanForButtons;
      scanForButtons();

      console.log('[Autorun] Observer active');
    `;

    await this.connection.injectScript(script);
  }

  private async removeObserver(): Promise<void> {
    const script = `
      if (window.__antigravityAutorunObserver) {
        window.__antigravityAutorunObserver.disconnect();
        window.__antigravityAutorunObserver = null;
        console.log('[Autorun] Observer removed');
      }
    `;
    try {
      await this.connection.injectScript(script);
    } catch {
      // Ignore — page may already be closed
    }
  }

  private startPolling(): void {
    this.pollInterval = setInterval(async () => {
      if (!this.isRunning) return;
      if (!this.connection.isActive()) return;
      try {
        const alive = await this.connection.evaluate(`!!window.__antigravityAutorunObserver`);
        if (!alive?.result?.value) {
          await this.injectObserver();
        } else {
          await this.connection.evaluate(`
            if (typeof window.__antigravityAutorunScan === 'function') {
              window.__antigravityAutorunScan();
            }
          `);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000);
  }
}
