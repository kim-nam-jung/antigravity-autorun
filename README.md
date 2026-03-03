# Antigravity Autorun v3.0

> True hands-free automation for your Antigravity Agent, reimagined.

Automatically authorizes **Run**, **Accept**, **Confirm**, and **Allow** commands in Google Antigravity IDE without simulating janky and slow mouse clicks.

## Version 3.0 Major Update: The API Sniffer Model
Prior to version 3.0, Antigravity Autorun relied on `MutationObserver` to scan the DOM and dispatch mouse clicks. This was CPU heavy, slow, and prone to breaking on UI updates.

**Version 3.0 completely replaces the DOM Clicker.**
- Using CDP Network Domain sniffing, we now intercept `HandleCascadeUserInteraction` packets the millisecond they are sent from the Language Server to the Frontend.
- The extension then fires a direct `fetch` POST Request to the backend's hidden API, instantly approving the interaction.
- Result: **0ms delay**, 0 UI dependencies, and maximum stability.

## Features

- **Direct API Approvals**: Interactions are accepted instantly over REST.
- **Network-Level Sniffing**: Immunity to CSS/DOM updates.
- **Dangerous command blocking**: Prevents auto-accepting `rm -rf`, `sudo`, etc.
- **Status bar toggle**: One-click ON/OFF.
- **Auto-restart**: Restarts Antigravity with CDP mode if not running.

## Requirements

Antigravity must be running with **CDP (Chrome DevTools Protocol)** enabled:

```bash
antigravity --remote-debugging-port=9222
```

Or just let the extension's auto-restart feature handle it when prompted!

## Usage

1. Install the extension.
2. If CDP is not enabled, click **"Yes, Restart"** when prompted.
3. Look for **`Auto: ON`** in the status bar.
4. Start using Antigravity Agent - interaction requests will be sniffed and automatically approved!

### Status Bar

| Status | Meaning |
|--------|---------|
| `✓ Auto: ON` | Active - requests will be sniffed & approved |
| `⊘ Auto: OFF` | Disabled - click to enable |
| `⊗ Auto: Error` | CDP connection failed |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `antigravityAutorun.enabled` | `true` | Enable on startup |
| `antigravityAutorun.cdpPort` | `9222` | CDP port |
| `antigravityAutorun.blockedCommands` | `["rm -rf /", ...]` | Never auto-approve these commands |
*(Note: Delay and Auto-Scroll settings have been deprecated in v3.0 as interactions are now instantaneous API calls.)*

## Release Notes

### 3.0.0
- **[MAJOR]** Complete architectural rewrite. Replaced DOM `ButtonClicker` with `NetworkAutoAccept` sniffer and `InteractionApi`.
- **[PERFORMANCE]** Immediate 0ms API-driven Accept.
- **[STABILITY]** Immune to DOM/CSS changes.

## License

MIT
