import CDP from 'chrome-remote-interface';

export interface CDPClient {
  Runtime: {
    evaluate: (params: { expression: string; returnByValue?: boolean }) => Promise<any>;
    enable: () => Promise<void>;
  };
  Page: {
    enable: () => Promise<void>;
  };
  DOM: {
    enable: () => Promise<void>;
  };
  close: () => Promise<void>;
}

export class CDPConnection {
  private client: CDPClient | null = null;
  private port: number;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  // 시도할 포트 목록 (순서대로 시도)
  private static readonly PORT_CANDIDATES = [9223, 9222, 9224, 9225];

  constructor(port: number = 9223) {
    this.port = port;
  }

  getPort(): number {
    return this.port;
  }

  setPort(port: number): void {
    this.port = port;
  }

  isActive(): boolean {
    return this.isConnected && this.client !== null;
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    // 현재 포트로 먼저 시도, 실패하면 다른 포트들 시도
    const portsToTry = [this.port, ...CDPConnection.PORT_CANDIDATES.filter(p => p !== this.port)];

    for (const port of portsToTry) {
      try {
        const connected = await this.tryConnectToPort(port);
        if (connected) {
          this.port = port;
          return;
        }
      } catch {
        console.log(`Port ${port} failed, trying next...`);
      }
    }

    throw new Error(`Failed to connect to CDP on any port: ${portsToTry.join(', ')}`);
  }

  private async tryConnectToPort(port: number): Promise<boolean> {
    try {
      // Try to find Antigravity targets
      const targets = await CDP.List({ port });

      // Priority: workbench (main window where buttons are) > Launchpad > jetski-agent
      const workbench = targets.find(
        (t: any) => t.type === 'page' && t.title.includes('Antigravity') && t.url.includes('workbench.html')
      );
      const launchpad = targets.find(
        (t: any) => t.type === 'page' && t.title === 'Launchpad'
      );
      const jetskiAgent = targets.find(
        (t: any) => t.type === 'page' && t.url.includes('jetski-agent')
      );

      const antigravityTarget = workbench || launchpad || jetskiAgent;

      if (!antigravityTarget) {
        console.log(`Port ${port}: No Antigravity target found`);
        return false;
      }

      console.log(`Port ${port}: Target found - ${antigravityTarget.title}`);

      const options: any = {
        host: 'localhost',
        port: port,
        target: antigravityTarget,
      };

      this.client = (await CDP(options)) as unknown as CDPClient;

      // Enable necessary domains
      await this.client.Runtime.enable();
      await this.client.Page.enable();
      await this.client.DOM.enable();

      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log(`CDP connected on port ${port}`);
      return true;
    } catch (error) {
      console.log(`Port ${port}: Connection failed - ${error}`);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.error('Error closing CDP connection:', error);
      }
      this.client = null;
    }
    this.isConnected = false;
  }

  async evaluate(expression: string): Promise<any> {
    if (!this.client || !this.isConnected) {
      throw new Error('CDP not connected');
    }

    try {
      const result = await this.client.Runtime.evaluate({
        expression,
        returnByValue: true,
      });
      return result;
    } catch (error) {
      // Connection might be lost, try to reconnect
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        this.isConnected = false;
        await this.connect();
        return this.evaluate(expression);
      }
      throw error;
    }
  }

  async injectScript(script: string): Promise<void> {
    await this.evaluate(`
      (function() {
        ${script}
      })();
    `);
  }
}
