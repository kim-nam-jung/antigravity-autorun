import * as vscode from 'vscode';

export class StatusBarUI implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private isEnabled = false;
  private isConnecting = false;
  private hasError = false;
  private isApiMode = false;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'antigravity-autorun.toggle';
    this.statusBarItem.tooltip = 'Click to toggle Antigravity Auto Accept';
    this.updateDisplay();
    this.statusBarItem.show();
  }

  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    this.hasError = false;
    this.isConnecting = false;
    this.isApiMode = false;
    this.updateDisplay();
  }

  setApiMode(apiMode: boolean): void {
    this.isApiMode = apiMode;
    this.hasError = false;
    this.isConnecting = false;
    this.isEnabled = true; // API 모드도 켜진 상태로 간주
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
    if (this.isConnecting) {
      this.statusBarItem.text = '$(sync~spin) Auto: Connecting...';
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    } else if (this.isApiMode) {
      this.statusBarItem.text = '$(check) Auto: ON (API Mode)';
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.prominentBackground'
      );
      this.statusBarItem.color = new vscode.ThemeColor(
        'statusBarItem.prominentForeground'
      );
      this.statusBarItem.tooltip =
        'Antigravity Auto Accept is ON (API Mode). Click to disable.';
    } else if (this.hasError) {
      this.statusBarItem.text = '$(error) Auto: Error';
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.errorBackground'
      );
      this.statusBarItem.color = undefined;
      this.statusBarItem.tooltip =
        'CDP connection error. Click to retry or check if Antigravity is running with CDP enabled.';
    } else if (this.isEnabled) {
      this.statusBarItem.text = '$(check) Auto: ON';
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.prominentBackground'
      );
      this.statusBarItem.color = new vscode.ThemeColor(
        'statusBarItem.prominentForeground'
      );
      this.statusBarItem.tooltip =
        'Antigravity Auto Accept is ON. Click to disable.';
    } else {
      this.statusBarItem.text = '$(circle-slash) Auto: OFF';
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.color = new vscode.ThemeColor(
        'statusBarItem.foreground'
      );
      this.statusBarItem.tooltip =
        'Antigravity Auto Accept is OFF. Click to enable.';
    }
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
