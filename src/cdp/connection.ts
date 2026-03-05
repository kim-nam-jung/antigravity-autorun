import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';
import CDP from 'chrome-remote-interface';
import { isWSL, getWindowsHost } from '../utils/os';

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

// ── 진단용 타입 ──────────────────────────────────────────────────────────────

export interface DevToolsPortStatus {
  fileFound: boolean;
  port: number | null;
  wsPath: string | null;
  portListening: boolean;
  stale: boolean; // 파일은 있지만 포트가 닫혀 있음
}

export type CDPUnavailableReason =
  | 'stale_port_file'   // DevToolsActivePort 있지만 포트 닫힘
  | 'no_port_file'      // DevToolsActivePort 파일 없음
  | 'port_scan_failed'; // 파일 없고 포트 스캔도 실패

export interface CDPConnectFailure {
  reason: CDPUnavailableReason;
  port: number | null;
  filePath?: string;
}

export class CDPConnectError extends Error {
  public readonly failure: CDPConnectFailure;
  constructor(failure: CDPConnectFailure) {
    super(`CDP unavailable: ${failure.reason} (port=${failure.port})`);
    this.name = 'CDPConnectError';
    this.failure = failure;
  }
}

// ── 로깅 콜백 ────────────────────────────────────────────────────────────────

let logFn: (msg: string) => void = (msg) => console.log(msg);
export function setCDPLogger(fn: (msg: string) => void) {
  logFn = fn;
}

// ── 내부 유틸 ────────────────────────────────────────────────────────────────

function buildUserDataDirs(): string[] {
  const dirs: string[] = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'Antigravity'),
    path.join(process.env.APPDATA || '', 'Antigravity'),
  ];

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

/**
 * TCP 소켓으로 해당 host:port 가 실제로 LISTEN 중인지 확인한다.
 * Node.js 내장 net 모듈만 사용 (외부 의존성 없음).
 */
function isTcpPortListening(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
    socket.connect(port, host);
  });
}

function readDevToolsActivePortRaw(): { port: number; wsPath: string; filePath: string } | null {
  for (const dir of USER_DATA_DIRS) {
    const portFile = path.join(dir, 'DevToolsActivePort');
    try {
      const content = fs.readFileSync(portFile, 'utf8').trim();
      const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length >= 2) {
        const port = parseInt(lines[0], 10);
        const wsPath = lines[1];
        if (!isNaN(port) && port > 0 && wsPath) {
          return { port, wsPath, filePath: portFile };
        }
      }
    } catch {
      // 파일 없음
    }
  }
  return null;
}

// ── 공개 진단 함수 ────────────────────────────────────────────────────────────

/**
 * DevToolsActivePort 파일 존재 여부와 실제 포트 생존 여부를 반환한다.
 * extension.ts의 diagnoseCDP() 와 connect() 양쪽에서 재사용한다.
 */
export async function checkDevToolsPortStatus(): Promise<DevToolsPortStatus> {
  const raw = readDevToolsActivePortRaw();
  if (!raw) {
    return { fileFound: false, port: null, wsPath: null, portListening: false, stale: false };
  }

  const host = isWSL() ? getWindowsHost() : '127.0.0.1';
  logFn(`[CDP] DevToolsActivePort found: port=${raw.port}, path=${raw.wsPath}`);

  const listening = await isTcpPortListening(host, raw.port);
  return {
    fileFound: true,
    port: raw.port,
    wsPath: raw.wsPath,
    portListening: listening,
    stale: !listening,
  };
}

// ── CDPConnection 클래스 ──────────────────────────────────────────────────────

export class CDPConnection {
  private client: CDPClient | null = null;
  private port: number;
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;

  private static readonly PORT_CANDIDATES = [9222];

  constructor(port: number = 9222) {
    this.port = port;
  }

  getPort(): number { return this.port; }
  setPort(port: number): void { this.port = port; }
  isActive(): boolean { return this.isConnected && this.client !== null; }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    if (this.client) {
      try { await this.client.close(); } catch (e) { /* ignore */ }
      this.client = null;
    }

    const host = isWSL() ? getWindowsHost() : '127.0.0.1';

    // 1순위: DevToolsActivePort 파일 확인 + TCP probe
    const status = await checkDevToolsPortStatus();

    if (status.fileFound) {
      if (status.stale) {
        // 파일은 있지만 포트가 닫혀 있음 → stale 파일, 즉시 실패
        logFn(`[CDP] Port ${status.port} is NOT listening (stale DevToolsActivePort). CDP disabled.`);
        throw new CDPConnectError({ reason: 'stale_port_file', port: status.port });
      }

      // 포트가 살아있음 → WebSocket 연결 시도
      const browserWsUrl = `ws://${host}:${status.port}${status.wsPath}`;
      logFn(`[CDP] Trying browser WebSocket: ${browserWsUrl}`);
      try {
        await this.connectViaBrowserEndpoint(browserWsUrl, status.port!, host);
        this.reconnectAttempts = 0;
        return;
      } catch (err) {
        logFn(`[CDP] Browser endpoint failed: ${err}. Falling back to port scan.`);
      }
    } else {
      logFn('[CDP] DevToolsActivePort not found, will try port scan');
    }

    // 2순위: 포트 스캔 (파일 없거나 WebSocket 연결 실패)
    const portsToTry = [...new Set([this.port, ...CDPConnection.PORT_CANDIDATES])];
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

    // 모두 실패
    if (!status.fileFound) {
      throw new CDPConnectError({ reason: 'no_port_file', port: null });
    }
    throw new CDPConnectError({ reason: 'port_scan_failed', port: this.port });
  }

  private async connectViaBrowserEndpoint(browserWsUrl: string, port: number, host: string = '127.0.0.1'): Promise<void> {
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

      const pageWsUrl = `ws://${host}:${port}/devtools/page/${pageTarget.targetId}`;
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
      try { await browserClient.close(); } catch (e) { /* ignore */ }
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
      } catch (e) { /* ignore */ }
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
