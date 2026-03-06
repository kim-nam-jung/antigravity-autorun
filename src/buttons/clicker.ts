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

    // Pass configuration to window object
    const configScript = `
      window.__antigravityAutorunConfig = ${JSON.stringify({
        delay,
        autoScroll,
        blockedCommands
      })};
    `;
    await this.connection.injectScript(configScript);

    const fs = require('fs');
    const path = require('path');
    
    // Check if bundled via esbuild (__dirname is out) vs tsc (__dirname is out/buttons)
    let scriptPath = path.join(__dirname, 'injected', 'clickObserver.js');
    if (!fs.existsSync(scriptPath)) {
      scriptPath = path.join(__dirname, '..', 'injected', 'clickObserver.js');
    }

    let script = '';
    try {
      const rawScript = fs.readFileSync(scriptPath, 'utf8');
      // Inject dummy 'exports' object so tsc's CommonJS output works in browser
      script = `
        var exports = {};
        ${rawScript}
      `;
    } catch (e) {
      console.error('[Autorun] Failed to load observer script', scriptPath, e);
      throw new Error(`Failed to load injected script: ${e}`);
    }

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
