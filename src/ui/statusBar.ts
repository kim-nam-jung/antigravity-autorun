import * as vscode from 'vscode';

export interface AutoClickSettings {
  runEnabled: boolean;
  retryEnabled: boolean;
  acceptEnabled: boolean;
}

export class StatusBarUI implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private isEnabled = false;
  private isConnecting = false;
  private hasError = false;
  private settings: AutoClickSettings = {
    runEnabled: true,
    retryEnabled: true,
    acceptEnabled: false,
  };
  private onSettingsChanged: ((settings: AutoClickSettings) => void) | null = null;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'antigravity-auto-accept.showMenu';
    this.statusBarItem.tooltip = 'Click to open Auto Accept settings';
    this.updateDisplay();
    this.statusBarItem.show();
  }

  setOnSettingsChanged(callback: (settings: AutoClickSettings) => void): void {
    this.onSettingsChanged = callback;
  }

  getSettings(): AutoClickSettings {
    return { ...this.settings };
  }

  async showMenu(): Promise<void> {
    // 메뉴를 계속 표시 (취소할 때까지 반복)
    while (true) {
      const runIcon = this.settings.runEnabled ? '$(check)' : '$(circle-slash)';
      const retryIcon = this.settings.retryEnabled ? '$(check)' : '$(circle-slash)';
      const acceptIcon = this.settings.acceptEnabled ? '$(check)' : '$(circle-slash)';

      const items: vscode.QuickPickItem[] = [
        {
          label: `${runIcon} Run Button`,
          description: this.settings.runEnabled ? 'ON' : 'OFF',
        },
        {
          label: `${retryIcon} Retry Button`,
          description: this.settings.retryEnabled ? 'ON' : 'OFF',
        },
        {
          label: `${acceptIcon} Accept Button`,
          description: this.settings.acceptEnabled ? 'ON' : 'OFF',
        },
      ];

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Auto Click Settings (ESC to close)',
      });

      // ESC나 바깥 클릭시 종료
      if (!selected) break;

      if (selected.label.includes('Run Button')) {
        this.settings.runEnabled = !this.settings.runEnabled;
      } else if (selected.label.includes('Retry Button')) {
        this.settings.retryEnabled = !this.settings.retryEnabled;
      } else if (selected.label.includes('Accept Button')) {
        this.settings.acceptEnabled = !this.settings.acceptEnabled;
      }

      this.notifySettingsChanged();
      this.updateDisplay();
    }
  }

  private notifySettingsChanged(): void {
    if (this.onSettingsChanged) {
      this.onSettingsChanged(this.settings);
    }
  }

  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    this.hasError = false;
    this.isConnecting = false;
    this.updateDisplay();
  }

  setConnecting(connecting: boolean): void {
    this.isConnecting = connecting;
    this.updateDisplay();
  }

  setError(error: boolean): void {
    this.hasError = error;
    this.updateDisplay();
  }

  private updateDisplay(): void {
    // 하나라도 활성화된 버튼이 있는지 확인
    const anyEnabled = this.settings.runEnabled || this.settings.retryEnabled || this.settings.acceptEnabled;

    if (this.isConnecting) {
      this.statusBarItem.text = '$(sync~spin) Auto: Connecting...';
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    } else if (this.hasError) {
      this.statusBarItem.text = '$(error) Auto: Error';
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.errorBackground'
      );
      this.statusBarItem.color = undefined;
      this.statusBarItem.tooltip =
        'CDP connection error. Click to retry or check if Antigravity is running with CDP enabled.';
    } else if (this.isEnabled && anyEnabled) {
      this.statusBarItem.text = '$(check) Auto: ON';
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.prominentBackground'
      );
      this.statusBarItem.color = new vscode.ThemeColor(
        'statusBarItem.prominentForeground'
      );
      this.statusBarItem.tooltip =
        'Click to open settings';
    } else {
      this.statusBarItem.text = '$(circle-slash) Auto: OFF';
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.color = new vscode.ThemeColor(
        'statusBarItem.foreground'
      );
      this.statusBarItem.tooltip =
        'Click to open settings';
    }
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
