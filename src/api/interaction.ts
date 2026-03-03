import * as vscode from 'vscode';
// node-fetch or native fetch (Node 18+ provides native fetch in global)
// If older Node version is used by VS Code extension host, you might need to install 'node-fetch'
// But for now we assume native fetch is available or use cross-fetch if needed later.

export class InteractionApi {
  // 실제 URL 경로 (포트 번호는 매번 바뀔 수 있으므로 추후 동적 추출 필요할 수 있음)
  private apiUrl: string = 'https://127.0.0.1:56315/exa.language_server_pb.LanguageServerService/HandleCascadeUserInteraction';
  
  // 인증 및 필수 헤더
  private csrfToken: string = '9bc2b01e-b2f8-4491-99b6-80442a561de9';

  constructor() {}

  /**
   * Cascade interaction 승인 (API 직접 호출 방식)
   * @param cascadeId Cascade 세션 ID
   * @param interaction 세부 인터랙션 정보 객체
   */
  async approveInteraction(cascadeId: string, interaction: any): Promise<boolean> {
    try {
      // Network 탭에서 확인된 실제 Request Payload 구조 적용
      const payload = {
        cascadeId,
        interaction: {
          trajectoryId: interaction.trajectoryId,
          stepIndex: interaction.stepIndex,
          runCommand: {
            confirm: true,
            proposedCommandLine: interaction.runCommand?.proposedCommandLine || 'echo "fallback"',
            submittedCommandLine: interaction.runCommand?.submittedCommandLine || 'echo "fallback"'
          }
        }
      };

      console.log(`[InteractionApi] API 호출 시도: ${this.apiUrl}`);

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'accept': '*/*',
          'accept-language': 'en-US',
          'connect-protocol-version': '1',
          'content-type': 'application/json',
          'origin': 'vscode-file://vscode-app',
          'x-codeium-csrf-token': this.csrfToken
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.error(`[InteractionApi] API 요청 실패: Status ${response.status} ${response.statusText}`);
        return false;
      }

      console.log('[InteractionApi] 인터랙션 승인 완료 (API통신)');
      return true;
    } catch (error) {
      console.error('[InteractionApi] API 통신 중 에러 발생:', error);
      return false;
    }
  }

  async checkPendingInteractions(): Promise<any[]> {
    return [];
  }
}
