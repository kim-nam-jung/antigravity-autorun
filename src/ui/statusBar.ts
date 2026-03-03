import * as vscode from 'vscode';

export class StatusBarUI implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private isEnabled = false;
  private isConnecting = false;
  private hasError = false;

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
      this.statusBarItem.command = undefined;
      this.statusBarItem.tooltip = 'Antigravity Autorun: Connecting to CDP...';
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
