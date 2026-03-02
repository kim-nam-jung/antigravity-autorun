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
      if (window.__antigravityAutoAcceptObserver) {
        window.__antigravityAutoAcceptObserver.disconnect();
      }

      // Configuration
      const CONFIG = {
        delay: ${delay},
        autoScroll: ${autoScroll},
        blockedCommands: ${JSON.stringify(blockedCommands)},
      };

      // Button text patterns to match
      const BUTTON_PATTERNS = [
        /^run$/i,
        /^accept$/i,
        /^accept all$/i,
        /^allow$/i,
        /^confirm$/i,
        /^continue$/i,
        /^proceed$/i,
        /^yes$/i,
        /^ok$/i,
      ];

      // Check if command is blocked
      function isCommandBlocked(element) {
        const parent = element.closest('[class*="terminal"], [class*="command"], [class*="prompt"]');
        if (!parent) return false;

        const commandText = parent.textContent || '';
        return CONFIG.blockedCommands.some(blocked =>
          commandText.toLowerCase().includes(blocked.toLowerCase())
        );
      }

      // Check if element is a target button
      function isTargetButton(element) {
        if (!element) return false;

        const tagName = element.tagName?.toLowerCase();
        const text = (element.textContent || '').trim();
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

        // Check not blocked
        if (isCommandBlocked(element)) {
          console.log('[AutoAccept] Blocked command detected, skipping');
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
          console.log('[AutoAccept] Clicked:', button.textContent?.trim());
        }, CONFIG.delay);
      }

      // Throttle function
      let lastClickTime = 0;
      function throttledClick(button) {
        const now = Date.now();
        if (now - lastClickTime < CONFIG.delay) return;
        lastClickTime = now;
        clickButton(button);
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
      window.__antigravityAutoAcceptObserver = new MutationObserver((mutations) => {
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
      window.__antigravityAutoAcceptObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Initial scan
      scanForButtons();

      console.log('[AutoAccept] Observer injected and active');
    `;

    await this.connection.injectScript(script);
    this.observerInjected = true;
  }

  private async removeObserver(): Promise<void> {
    const script = `
      if (window.__antigravityAutoAcceptObserver) {
        window.__antigravityAutoAcceptObserver.disconnect();
        window.__antigravityAutoAcceptObserver = null;
        console.log('[AutoAccept] Observer removed');
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
        // Re-inject observer if needed
        if (!this.observerInjected) {
          await this.injectObserver();
        }

        // Trigger manual scan
        await this.connection.evaluate(`
          if (typeof scanForButtons === 'function') {
            scanForButtons();
          }
        `);
      } catch (error) {
        console.error('Polling error:', error);
        this.observerInjected = false;
      }
    }, 2000);
  }
}
