import * as vscode from 'vscode';
import { CDPConnection } from '../cdp/connection';

// Button selectors for Antigravity IDE
const BUTTON_SELECTORS = [
  // Run buttons
  'button[data-testid*="run"]',
  'button:has-text("Run")',

  // Accept buttons
  'button[data-testid*="accept"]',
  'button:has-text("Accept")',
  'button:has-text("Accept All")',

  // Allow/Confirm buttons
  'button:has-text("Allow")',
  'button:has-text("Confirm")',
  'button:has-text("Continue")',
  'button:has-text("Proceed")',

  // Generic styled buttons (React components)
  'span[class*="cursor-pointer"]:has-text("Accept")',
  'div[role="button"]:has-text("Accept")',
  'div[role="button"]:has-text("Run")',
];

export class ButtonClicker {
  private connection: CDPConnection;
  private config: vscode.WorkspaceConfiguration;
  private isRunning = false;
  private observerInjected = false;
  private pollInterval: NodeJS.Timeout | null = null;
  constructor(connection: CDPConnection, config: vscode.WorkspaceConfiguration) {
    this.connection = connection;
    this.config = config;
  }

  updateConfig(config: vscode.WorkspaceConfiguration): void {
    this.config = config;
  }
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      // Inject MutationObserver for instant detection
      await this.injectObserver();

      // Also poll as fallback
      this.startPolling();
    } catch (error) {
      console.error('Failed to start button clicker:', error);
      this.isRunning = false;
      throw error;
    }
  }

  stop(): void {
    this.isRunning = false;
    this.observerInjected = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Remove observer from page
    this.removeObserver().catch(console.error);
  }

  private async injectObserver(): Promise<void> {
    const delay = this.config.get<number>('delay', 100);
    const autoScroll = this.config.get<boolean>('autoScroll', true);
    const blockedCommands = this.config.get<string[]>('blockedCommands', []);

    const script = `
      // Remove existing observer if any
      if (window.__antigravityAutorunObserver) {
        window.__antigravityAutorunObserver.disconnect();
      }

      // Configuration
      const CONFIG = {
        delay: ${delay},
        autoScroll: ${autoScroll},
        blockedCommands: ${JSON.stringify(blockedCommands)},
      };

      // Button text patterns to match
      // Use case-insensitive search anywhere in the button text to handle icons
      const BUTTON_PATTERNS = [
        /\\brun\\b/i,
        /\\bretry\\b/i,
        /\\baccept(\\s|$|\\b)/i,
        /\\bconfirm\\b/i,
        /\\ballow\\b/i,
        /\\ballow once\\b/i,
        /\\ballow this conversation\\b/i,
      ];

      // Patterns to exclude (settings buttons)
      const EXCLUDE_PATTERNS = [
        /^always run/i,
        /run button/i,
        /retry button/i,
        /accept\/allow/i,
        /auto click settings/i,
      ];

      // Check if command is blocked
      function isCommandBlocked(element) {
        // Only check immediate command container, not the whole terminal
        const parent = element.closest('[class*="command-body"], [class*="prompt"]');
        if (!parent) return false;

        const commandText = parent.textContent || '';
        return CONFIG.blockedCommands.some(blocked =>
          commandText.toLowerCase().includes(blocked.toLowerCase())
        );
      }

      // Check if element is a target button
      function isTargetButton(element) {
        if (!element) return false;

        // Check if disabled or hidden
        if (element.disabled || 
            element.getAttribute('disabled') !== null || 
            element.getAttribute('aria-disabled') === 'true' ||
            element.closest('[disabled]') ||
            element.closest('[aria-disabled="true"]') ||
            element.getBoundingClientRect().width === 0 ||
            getComputedStyle(element).visibility === 'hidden') {
          return false;
        }

        const tagName = element.tagName?.toLowerCase();
        // Include aria-label and title for icon-only buttons
        const text = ((element.textContent || '') + ' ' + (element.getAttribute('aria-label') || '') + ' ' + (element.getAttribute('title') || '')).trim();
        const role = element.getAttribute('role');

        // Must be clickable
        const isClickable =
          tagName === 'button' ||
          role === 'button' ||
          element.classList.contains('cursor-pointer') ||
          getComputedStyle(element).cursor === 'pointer';

        if (!isClickable) return false;

        // Check text matches
        const matchesPattern = BUTTON_PATTERNS.some(pattern => pattern.test(text));
        if (!matchesPattern) return false;

        // Check excluded patterns (settings/deny buttons)
        const isExcluded = EXCLUDE_PATTERNS.some(pattern => pattern.test(text));
        if (isExcluded) return false;

        // Check not blocked
        if (isCommandBlocked(element)) {
          console.log('[Autorun] Blocked command detected, skipping');
          return false;
        }

        return true;
      }

      // Click button with optional scroll
      function clickButton(button) {
        if (CONFIG.autoScroll) {
          button.scrollIntoView({ behavior: 'instant', block: 'center' });
        }

        // Small delay for scroll to complete
        setTimeout(() => {
          // Dispatch click event
          button.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
          }));
          console.log('[Autorun] Clicked:', button.textContent?.trim());
        }, CONFIG.delay);
      }

      // Queue-based clicker to avoid dropping concurrent buttons
      let isClicking = false;
      const clickQueue = [];

      function processQueue() {
        if (isClicking || clickQueue.length === 0) return;
        isClicking = true;

        const button = clickQueue.shift();

        // Double check it's still in the DOM and visible right before clicking
        if (document.body.contains(button) && button.getBoundingClientRect().width > 0) {
          clickButton(button);
        }

        setTimeout(() => {
          isClicking = false;
          processQueue();
        }, CONFIG.delay);
      }

      function throttledClick(button) {
        if (!clickQueue.includes(button)) {
          clickQueue.push(button);
          processQueue();
        }
      }

      // Scan for buttons
      function scanForButtons() {
        const allElements = document.querySelectorAll('button, [role="button"], span, div');
        allElements.forEach(element => {
          if (isTargetButton(element)) {
            throttledClick(element);
          }
        });
      }

      // Create MutationObserver
      window.__antigravityAutorunObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          // Check added nodes
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node;

              // Check the node itself
              if (isTargetButton(element)) {
                throttledClick(element);
              }

              // Check children
              const buttons = element.querySelectorAll?.('button, [role="button"], span, div');
              buttons?.forEach(btn => {
                if (isTargetButton(btn)) {
                  throttledClick(btn);
                }
              });
            }
          }
        }
      });

      // Start observing
      window.__antigravityAutorunObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Expose scan function globally so polling can call it
      window.__antigravityAutorunScan = scanForButtons;

      // Initial scan
      scanForButtons();

      console.log('[Autorun] Observer injected and active');
    `;

    await this.connection.injectScript(script);
    this.observerInjected = true;
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
    } catch (error) {
      // Ignore errors when removing (page might be closed)
    }
  }

  private startPolling(): void {
    // Poll every 2 seconds as fallback
    this.pollInterval = setInterval(async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        // Re-inject observer if it's gone (page reload, etc.)
        const alive = await this.connection.evaluate(`!!window.__antigravityAutorunObserver`);
        if (!alive?.result?.value) {
          await this.injectObserver();
        }

        // Trigger manual scan
        await this.connection.evaluate(`
          if (typeof window.__antigravityAutorunScan === 'function') {
            window.__antigravityAutorunScan();
          }
        `);
      } catch (error) {
        console.error('Polling error:', error);
        this.observerInjected = false;
      }
    }, 2000);
  }
}
