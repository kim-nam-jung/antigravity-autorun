import * as vscode from 'vscode';

export class StatusBarUI implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private isEnabled = false;
  private isConnecting = false;
  private hasError = false;
  private needsSetup = false;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'antigravity-autorun.toggle';
    this.statusBarItem.tooltip = 'Click to toggle Autorun ON/OFF';
    this.updateDisplay();
    this.statusBarItem.show();
  }

  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    this.hasError = false;
    this.isConnecting = false;
    this.needsSetup = false;
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

  setNeedsSetup(value: boolean): void {
    this.needsSetup = value;
    if (value) {
      this.hasError = false;
      this.isConnecting = false;
      this.isEnabled = false;
    }
    this.updateDisplay();
  }

  private updateDisplay(): void {
    if (this.isConnecting) {
      this.statusBarItem.text = '$(sync~spin) Auto: Connecting...';
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
      this.statusBarItem.command = undefined;
      this.statusBarItem.tooltip = 'Antigravity Autorun: Connecting to CDP...';
    } else if (this.needsSetup) {
      this.statusBarItem.text = '$(gear) Auto: Setup Needed';
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.statusBarItem.color = undefined;
      this.statusBarItem.command = 'antigravity-autorun.showSetupInstructions';
      this.statusBarItem.tooltip = 'CDP가 비활성화되어 있습니다. 클릭하여 설정 방법을 확인하세요.';
    } else if (this.hasError) {
      this.statusBarItem.text = '$(error) Auto: Error';
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      this.statusBarItem.color = undefined;
      this.statusBarItem.command = 'antigravity-autorun.reconnect';
      this.statusBarItem.tooltip = 'CDP connection error. Click to reconnect.';
    } else if (this.isEnabled) {
      this.statusBarItem.text = '$(check) Auto: ON';
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
      this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
      this.statusBarItem.command = 'antigravity-autorun.toggle';
      this.statusBarItem.tooltip = 'Antigravity Autorun: ON (CDP). Click to toggle.';
    } else {
      this.statusBarItem.text = '$(circle-slash) Auto: OFF';
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.foreground');
      this.statusBarItem.command = 'antigravity-autorun.toggle';
      this.statusBarItem.tooltip = 'Antigravity Autorun: OFF. Click to toggle.';
    }
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
