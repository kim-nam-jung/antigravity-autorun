import * as vscode from 'vscode';
import { CDPConnection, CDPClient } from '../cdp/connection';
import { InteractionApi } from '../api/interaction';

export class NetworkAutoAccept {
  private connection: CDPConnection;
  private api: InteractionApi;
  private config: vscode.WorkspaceConfiguration;
  private isRunning = false;
  private clientListenerKeys: string[] = [];

  constructor(connection: CDPConnection, config: vscode.WorkspaceConfiguration) {
    this.connection = connection;
    this.config = config;
    this.api = new InteractionApi();
  }

  updateConfig(config: vscode.WorkspaceConfiguration): void {
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    try {
      const client = this.connection.getClient();
      if (!client) {
        throw new Error('CDP Client is not initialized.');
      }

      console.log('[NetworkAutoAccept] Listening for Network events...');

      // Listen for WebSocket frames coming from the backend
      const onWebSocketFrameRecv = (params: any) => {
        if (!this.isRunning) return;

        try {
          const payloadData = params.response?.payloadData;
          if (payloadData) {
            this.analyzeNetworkPayload(payloadData, 'WebSocket');
          }
        } catch (err) {
          // JSON 파싱 에러 무시 (일반 텍스트 프레임일 수 있음)
        }
      };

      // Listen for standard HTTP responses (fallback)
      const onResponseReceived = async (params: any) => {
        if (!this.isRunning) return;

        const responseUrl = params.response?.url || '';
        // Language server / cascade 관련 요청만 가로채기
        if (responseUrl.includes('HandleCascadeUserInteraction') || responseUrl.includes('cascade')) {
          try {
            const bodyResult = await client.Network.getResponseBody({ requestId: params.requestId });
            this.analyzeNetworkPayload(bodyResult.body, 'HTTP Response');
          } catch (err) {
            console.error('[NetworkAutoAccept] Failed to get response body:', err);
          }
        }
      };

      client.on('Network.webSocketFrameReceived', onWebSocketFrameRecv);
      client.on('Network.responseReceived', onResponseReceived);

      this.clientListenerKeys.push('Network.webSocketFrameReceived', 'Network.responseReceived');
      
    } catch (error) {
      console.error('[NetworkAutoAccept] Failed to start network listener:', error);
      this.isRunning = false;
      throw error;
    }
  }

  private async analyzeNetworkPayload(rawPayload: string, source: string) {
    try {
      // payload가 JSON 객체 문자열 배열 형태 등 다양할 수 있으므로, 단순 파싱 시도
      const data = JSON.parse(rawPayload);
      
      // JSON-RPC 형태의 배열이거나 중첩된 객체일 수 있음. 임시로 cascadeId나 runCommand를 재귀적으로 찾음
      const pendingInteraction = this.extractPendingInteraction(data);

      if (pendingInteraction && pendingInteraction.cascadeId && pendingInteraction.interaction) {
        console.log(`[NetworkAutoAccept] Found pending interaction via ${source}!`, pendingInteraction);

        // API로 즉시 수락 쏘기
        const success = await this.api.approveInteraction(
          pendingInteraction.cascadeId, 
          pendingInteraction.interaction
        );

        if (success) {
          console.log(`[NetworkAutoAccept] Automatically accepted cascade step.`);
        }
      }
    } catch (e) {
      // Not JSON or irrelevant structure
    }
  }

  /**
   * 응답 데이터 내부에서 펜딩 중인 interaction 객체를 찾아냅니다.
   */
  private extractPendingInteraction(obj: any): any {
    if (!obj || typeof obj !== 'object') return null;

    // 만약 객체 자체가 우리가 찾는 구조라면. (cascadeId와 interaction 객체를 동시 보유)
    if (obj.cascadeId && obj.interaction && obj.interaction.trajectoryId && obj.interaction.stepIndex !== undefined) {
      // 추가적으로, 이미 완료된 것이 아니라 '승인 대기 중(Pending)' 인지 확인하는 플래그가 객체 안에 있을 수 있습니다.
      // 지금은 발견 즉시 반환
      return {
        cascadeId: obj.cascadeId,
        interaction: obj.interaction
      };
    }

    // 배열이나 중첩 객체 내부 탐색
    for (const key of Object.keys(obj)) {
      const result = this.extractPendingInteraction(obj[key]);
      if (result) return result;
    }

    return null;
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    // Note: 'chrome-remote-interface' EventEmitter does not have an easy 'off' method safely typed here.
    // However, stopping `isRunning = false` safely kills the logic inside the callbacks.
    console.log('[NetworkAutoAccept] Stopped listening.');
  }
}
