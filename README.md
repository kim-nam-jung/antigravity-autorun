# Antigravity Autorun v3.0

> True hands-free automation for your Antigravity Agent, reimagined.

Automatically authorizes **Run**, **Accept**, **Confirm**, and **Allow** commands in Google Antigravity IDE without simulating janky and slow mouse clicks.

---

## Version 3.0: The API Sniffer Model

Prior to v3.0, Antigravity Autorun relied on `MutationObserver` to scan the DOM and dispatch mouse clicks. This was CPU heavy, slow, and prone to breaking on UI updates.

**Version 3.0 completely replaces the DOM Clicker.**

- Using **CDP Network Domain sniffing**, we intercept `HandleCascadeUserInteraction` packets the millisecond they are sent from the Language Server to the Frontend.
- The extension fires a direct `fetch` POST request to the backend's hidden API, instantly approving the interaction.
- Result: **0ms delay**, zero UI dependencies, maximum stability.

---

## Features

- **Direct API Approvals** — Interactions are accepted instantly over REST.
- **Network-Level Sniffing** — Immune to CSS/DOM updates.
- **Auto CDP Relaunch** — If Antigravity is not running with CDP mode, the extension **automatically restarts it** with `--remote-debugging-port=9222`. No manual steps needed.
- **Dangerous Command Blocking** — Prevents auto-accepting `rm -rf`, `sudo`, etc.
- **Status Bar Toggle** — One-click ON/OFF.

---

## How to Use

1. Install the extension.
2. Launch Antigravity normally — the extension will automatically detect if CDP is not enabled and **restart Antigravity with CDP mode**.
3. Look for **`✓ Auto: ON`** in the status bar.
4. Start using Antigravity Agent — interaction requests will be sniffed and automatically approved!

> **No manual setup required.** The extension handles everything automatically.

---

## Status Bar

| Status | Meaning |
|--------|---------|
| `✓ Auto: ON` | Active — requests are being sniffed & approved |
| `⊘ Auto: OFF` | Disabled — click to enable |
| `↻ Auto: Connecting...` | Connecting or restarting Antigravity |
| `⊗ Auto: Error` | CDP connection failed |

---

## Command Palette (`Ctrl+Shift+P`)

- `Antigravity Autorun: Toggle ON/OFF`
- `Antigravity Autorun: Reconnect CDP`
- `Antigravity Autorun: Relaunch with CDP Mode`
- `Antigravity Autorun: Diagnose CDP Targets (Debug)`
- `Antigravity Autorun: Show CDP Setup Instructions`

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `antigravityAutorun.enabled` | `true` | Enable on startup |
| `antigravityAutorun.cdpPort` | `9222` | CDP port |
| `antigravityAutorun.blockedCommands` | `["rm -rf /", ...]` | Never auto-approve these commands |

---

## Release Notes

### 3.0.5
- **[FIX]** Auto CDP relaunch now works correctly. Previously, killing Antigravity also killed the extension (child process), preventing restart. Now uses an independent external PowerShell process to perform the restart.
- **[FIX]** All CDP failure types (`stale_port_file`, `no_port_file`, `port_scan_failed`) now trigger auto-relaunch.
- **[FIX]** Port detection uses direct TCP check instead of DevToolsActivePort file.

### 3.0.0
- **[MAJOR]** Complete architectural rewrite. Replaced DOM `ButtonClicker` with `NetworkAutoAccept` sniffer and `InteractionApi`.
- **[PERFORMANCE]** Immediate 0ms API-driven Accept.
- **[STABILITY]** Immune to DOM/CSS changes.

---

## License

MIT
