import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import CDP from 'chrome-remote-interface';
import { isWSL, getWindowsHost, toWSLPath } from '../utils/os';

export interface CDPClient {
  Runtime: {
    evaluate: (params: { expression: string; returnByValue?: boolean }) => Promise<any>;
    enable: () => Promise<void>;
  };
  Page: {
    enable: () => Promise<void>;
  };
  Network: {
    enable: () => Promise<void>;
    getResponseBody: (params: { requestId: string }) => Promise<{ body: string; base64Encoded: boolean }>;
  };
  DOM: {
    enable: () => Promise<void>;
  };
  on: (event: string, callback: (params: any) => void) => void;
  close: () => Promise<void>;
}

// 로깅 콜백 — extension.ts에서 outputChannel에 라우팅
let logFn: (msg: string) => void = (msg) => console.log(msg);
export function setCDPLogger(fn: (msg: string) => void) {
  logFn = fn;
}

function buildUserDataDirs(): string[] {
  const dirs: string[] = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'Antigravity'),
    path.join(process.env.APPDATA || '', 'Antigravity'),
  ];

  // WSL 환경: /mnt/c/Users/<user>/AppData/Roaming/Antigravity 경로 추가
  if (isWSL()) {
    try {
      const usersDir = '/mnt/c/Users';
      const entries = fs.readdirSync(usersDir);
      for (const entry of entries) {
        if (['Public', 'Default', 'Default User', 'desktop.ini', 'All Users'].includes(entry)) continue;
        dirs.push(path.join(usersDir, entry, 'AppData', 'Roaming', 'Antigravity'));
      }
    } catch {
      // /mnt/c 마운트가 없으면 무시
    }
  }

  return dirs;
}

const USER_DATA_DIRS = buildUserDataDirs();

function readDevToolsActivePort(): { port: number; wsPath: string } | null {
  for (const dir of USER_DATA_DIRS) {
    const portFile = path.join(dir, 'DevToolsActivePort');
    try {
      const content = fs.readFileSync(portFile, 'utf8').trim();
      const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length >= 2) {
        const port = parseInt(lines[0], 10);
        const wsPath = lines[1];
        if (!isNaN(port) && port > 0 && wsPath) {
          logFn(`[CDP] DevToolsActivePort found: port=${port}, path=${wsPath}`);
          return { port, wsPath };
        }
      }
    } catch {
      // 파일 없음
    }
  }
  logFn('[CDP] DevToolsActivePort not found, will try port scan');
  return null;
}

export class CDPConnection {
  private client: CDPClient | null = null;
  private port: number;
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;

  private static readonly PORT_CANDIDATES = [9222, 9223, 9224, 9225];

  constructor(port: number = 9222) {
    this.port = port;
  }

  getPort(): number { return this.port; }
  setPort(port: number): void { this.port = port; }
  isActive(): boolean { return this.isConnected && this.client !== null; }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    // 이전 stale 연결 정리
    if (this.client) {
      try { await this.client.close(); } catch {}
      this.client = null;
    }

    // 1순위: DevToolsActivePort 파일로 Browser → Page WebSocket 연결
    const devToolsInfo = readDevToolsActivePort();
    if (devToolsInfo) {
      const { port, wsPath } = devToolsInfo;
      const browserWsUrl = `ws://127.0.0.1:${port}${wsPath}`;
      logFn(`[CDP] Trying browser WebSocket: ${browserWsUrl}`);
      try {
        await this.connectViaBrowserEndpoint(browserWsUrl, port);
        this.reconnectAttempts = 0;
        return;
      } catch (err) {
        logFn(`[CDP] Browser endpoint failed: ${err}. Falling back to port scan.`);
      }
    }

    // 2순위: HTTP /json 포트 스캔 (폴백)
    const portsToTry = [this.port, ...CDPConnection.PORT_CANDIDATES.filter(p => p !== this.port)];
    for (const port of portsToTry) {
      try {
        const connected = await this.tryConnectViaHttpList(port);
        if (connected) {
          this.port = port;
          this.reconnectAttempts = 0;
          return;
        }
      } catch {
        logFn(`[CDP] Port ${port} scan failed`);
      }
    }

    throw new Error(`Failed to connect to CDP. Tried DevToolsActivePort and ports: ${portsToTry.join(', ')}`);
  }

  private async connectViaBrowserEndpoint(browserWsUrl: string, port: number): Promise<void> {
    const browserClient = await Promise.race([
      CDP({ target: browserWsUrl }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('browser connect timeout')), 5000))
    ]) as any;

    let pageClient: CDPClient | null = null;
    try {
      const { targetInfos } = await browserClient.Target.getTargets();
      logFn(`[CDP] Found ${targetInfos.length} targets: ${JSON.stringify(targetInfos.map((t: any) => `[${t.type}] ${t.title} | ${t.url}`))}`);

      const pageTarget =
        targetInfos.find((t: any) => t.type === 'page' && t.url?.includes('workbench.html')) ||
        targetInfos.find((t: any) => t.type === 'page' && t.title === 'Launchpad') ||
        targetInfos.find((t: any) => t.type === 'page' && t.url?.includes('jetski-agent')) ||
        targetInfos.find((t: any) =>
          t.type === 'page' &&
          !t.url?.startsWith('devtools://') &&
          !t.url?.startsWith('chrome-extension://') &&
          !t.url?.startsWith('about:')
        );

      if (!pageTarget) {
        throw new Error(`No suitable page target found among ${targetInfos.length} targets`);
      }

      logFn(`[CDP] Selected target: [${pageTarget.type}] "${pageTarget.title}" | ${pageTarget.url}`);

      const pageWsUrl = `ws://127.0.0.1:${port}/devtools/page/${pageTarget.targetId}`;
      logFn(`[CDP] Connecting to page WebSocket: ${pageWsUrl}`);

      pageClient = await Promise.race([
        CDP({ target: pageWsUrl }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('page connect timeout')), 5000))
      ]) as unknown as CDPClient;

      await pageClient.Runtime.enable();
      await pageClient.Page.enable();
      await pageClient.DOM.enable();

      this.client = pageClient;
      this.port = port;
      this.isConnected = true;
      logFn(`[CDP] Connected to page on port ${port}`);

    } finally {
      try { await browserClient.close(); } catch {}
    }
  }

  private async tryConnectViaHttpList(port: number): Promise<boolean> {
    try {
      const host = isWSL() ? getWindowsHost() : 'localhost';
      const targets = await Promise.race([
        CDP.List({ host, port }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]);

      logFn(`[CDP] Port ${port} HTTP list: ${(targets as any[]).length} targets`);

      const target =
        (targets as any[]).find((t: any) => t.type === 'page' && t.url?.includes('workbench.html')) ||
        (targets as any[]).find((t: any) => t.type === 'page' && t.title === 'Launchpad') ||
        (targets as any[]).find((t: any) => t.type === 'page' && t.url?.includes('jetski-agent')) ||
        (targets as any[]).find((t: any) =>
          t.type === 'page' &&
          !t.url?.includes('devtools://') &&
          !t.url?.includes('chrome-extension://') &&
          !t.url?.startsWith('about:')
        );

      if (!target) {
        logFn(`[CDP] Port ${port}: no suitable page target`);
        return false;
      }

      logFn(`[CDP] Port ${port}: connecting to "${target.title}"`);
      const client = (await CDP({ host, port, target })) as unknown as CDPClient;

      await client.Runtime.enable();
      await client.Page.enable();
      await client.DOM.enable();

      this.client = client;
      this.isConnected = true;
      logFn(`[CDP] Connected via HTTP list on port ${port}`);
      return true;
    } catch (error) {
      logFn(`[CDP] Port ${port} HTTP list failed: ${error}`);
      return false;
    }
  }

  getClient(): CDPClient | null {
    return this.client;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        (this.client as any).removeAllListeners?.('disconnect');
        await this.client.close();
      } catch {}
      this.client = null;
    }
    this.isConnected = false;
    this.reconnectAttempts = 0;
  }

  async evaluate(expression: string, retries: number = 3): Promise<any> {
    if (!this.client || !this.isConnected) {
      throw new Error('CDP not connected');
    }

    try {
      return await this.client.Runtime.evaluate({ expression, returnByValue: true });
    } catch (error) {
      // 연결이 끊긴 경우 재연결 시도
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        this.isConnected = false;
        this.client = null;
        logFn(`[CDP] evaluate failed, reconnecting (attempt ${this.reconnectAttempts})...`);
        await this.connect();
        return this.evaluate(expression, retries - 1);
      }
      throw error;
    }
  }

  async injectScript(script: string): Promise<void> {
    await this.evaluate(`(function() { ${script} })();`);
  }
}
