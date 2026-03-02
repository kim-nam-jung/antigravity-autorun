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

  constructor(port: number = 9222) {
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

    try {
      // Try to find Launchpad (Agent panel) - this is where Run/Accept buttons are
      const targets = await CDP.List({ port: this.port });

      // Priority: Launchpad > jetski-agent > workbench
      const launchpad = targets.find(
        (t: any) => t.type === 'page' && t.title === 'Launchpad'
      );
      const jetskiAgent = targets.find(
        (t: any) => t.type === 'page' && t.url.includes('jetski-agent')
      );
      const workbench = targets.find(
        (t: any) => t.type === 'page' && t.url.includes('workbench')
      );

      const antigravityTarget = launchpad || jetskiAgent || workbench;
      console.log('Target found:', antigravityTarget?.title || 'default');

      const options: any = {
        host: 'localhost',
        port: this.port,
      };

      if (antigravityTarget) {
        options.target = antigravityTarget;
      }

      this.client = (await CDP(options)) as unknown as CDPClient;

      // Enable necessary domains
      await this.client.Runtime.enable();
      await this.client.Page.enable();
      await this.client.DOM.enable();

      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log(`CDP connected on port ${this.port}`);
    } catch (error) {
      this.isConnected = false;
      this.client = null;
      throw new Error(`Failed to connect to CDP on port ${this.port}: ${error}`);
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
