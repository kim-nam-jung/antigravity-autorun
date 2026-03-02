# Antigravity Autorun

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](#) [![License](https://img.shields.io/badge/license-MIT-green.svg)](#)

> True hands-free automation for your Antigravity Agent.

**Antigravity Autorun** is a lightweight VS Code extension that automatically clicks interactive buttons (Run, Retry, Accept, Allow) in the Antigravity IDE. Once enabled, your AI agent runs completely autonomously without waiting for manual confirmation clicks.

---

## Features

- **Instant Detection** — Uses `MutationObserver` to detect and click newly rendered buttons with no lag.
- **Simple ON/OFF Toggle** — Click the status bar item to enable or disable automation instantly.
- **All Button Types Covered** — Automatically handles `Run`, `Retry`, `Accept`, `Accept All`, `Allow`, `Allow Once`, and `Allow This Conversation` buttons.
- **Smart Auto-scroll** — Scrolls hidden buttons into view before clicking so nothing gets missed.
- **Safety Filters** — Blocked commands (e.g., `rm -rf /`, `sudo rm`) are never auto-accepted.
- **Auto-reconnect** — If the CDP connection drops, the extension automatically reconnects.

---

## How to Use

### 1. Start Antigravity with CDP enabled

The extension connects to Antigravity via Chrome DevTools Protocol (CDP). Launch Antigravity with:

```
antigravity --remote-debugging-port=9222
```

If you forget, the extension will offer to restart Antigravity automatically when you enable it.

### 2. Toggle Autorun

Look for the status bar item in the bottom-right corner of VS Code:

| Status | Meaning |
|--------|---------|
| `✓ Auto: ON` | Autorun is active — buttons are being clicked automatically |
| `⊘ Auto: OFF` | Autorun is paused |
| `↻ Auto: Connecting...` | Connecting to Antigravity via CDP |
| `✗ Auto: Error` | CDP connection failed — click to retry |

**Click the status bar item** to toggle ON/OFF.

You can also use the Command Palette (`Ctrl+Shift+P`):
- `Antigravity Autorun: Toggle ON/OFF`
- `Antigravity Autorun: Reconnect CDP`
- `Antigravity Autorun: Restart Antigravity with CDP`

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `antigravityAutorun.enabled` | `true` | Auto-start on VS Code launch |
| `antigravityAutorun.cdpPort` | `9222` | CDP port for Antigravity connection |
| `antigravityAutorun.delay` | `100` | Delay (ms) before clicking a button |
| `antigravityAutorun.autoScroll` | `true` | Scroll buttons into view before clicking |
| `antigravityAutorun.blockedCommands` | see below | Commands that will never be auto-accepted |

**Default blocked commands:**
```json
["rm -rf /", "sudo rm", "format", "del /"]
```

You can customize this list in VS Code Settings under `antigravityAutorun.blockedCommands`.

---

## Known Limitations

- Requires Antigravity to be running with `--remote-debugging-port` flag enabled.
- If Antigravity is updated, you may need to run **Reconnect CDP** from the Command Palette.
- CDP port defaults to `9222`, with automatic fallback to `9223`, `9224`, `9225`.
