<<<<<<< HEAD
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
=======
# Antigravity Autorun

> True hands-free automation for your Antigravity Agent.

**Antigravity Autorun** is a lightweight VS Code extension that automatically clicks interactive buttons in the Antigravity IDE. Once enabled, your AI agent runs completely autonomously without waiting for manual confirmation clicks.

---

## Features

- **Instant Detection** — Uses `MutationObserver` to detect and click newly rendered buttons with no lag.
- **Simple ON/OFF Toggle** — Click the status bar item to enable or disable automation instantly.
- **All Button Types Covered** — Automatically handles `Run`, `Retry`, `Accept`, `Accept All`, `Allow`, `Allow Once`, and `Allow This Conversation` buttons.
- **Smart Auto-scroll** — Scrolls hidden buttons into view before clicking so nothing gets missed.
- **Safety Filters** — Blocked commands (e.g., `rm -rf /`, `sudo rm`) are never auto-accepted.
- **Auto-reconnect** — If the CDP connection drops, the extension automatically reconnects.
- **Auto-restart** — If Antigravity is not running with CDP mode, the extension offers to restart it automatically.
>>>>>>> 267387f8ebb147e46d4aed8c5a3f865e5233b899

---

## How to Use

### 1. Start Antigravity with CDP enabled

The extension connects to Antigravity via Chrome DevTools Protocol (CDP). Launch Antigravity with:

```
antigravity --remote-debugging-port=9222
```

<<<<<<< HEAD
Or just let the extension's auto-restart feature handle it when prompted!
=======
If you forget, the extension will offer to restart Antigravity automatically.
>>>>>>> 267387f8ebb147e46d4aed8c5a3f865e5233b899

### 2. Toggle Autorun

<<<<<<< HEAD
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

=======
Look for the status bar item in the bottom-right corner:

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

>>>>>>> 267387f8ebb147e46d4aed8c5a3f865e5233b899
## Settings

| Setting | Default | Description |
|---------|---------|-------------|
<<<<<<< HEAD
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
=======
| `antigravityAutorun.enabled` | `true` | Auto-start on launch |
| `antigravityAutorun.cdpPort` | `9222` | CDP port for Antigravity connection |
| `antigravityAutorun.delay` | `100` | Delay (ms) before clicking a button |
| `antigravityAutorun.autoScroll` | `true` | Scroll buttons into view before clicking |
| `antigravityAutorun.blockedCommands` | see below | Commands that will never be auto-run |

**Default blocked commands:**
```json
["rm -rf /", "sudo rm", "format", "del /"]
```

---

## Known Limitations

- Requires Antigravity to be running with `--remote-debugging-port` flag enabled.
- CDP port defaults to `9222`, with automatic fallback to `9223`, `9224`, `9225`.
- If Antigravity is updated, run **Reconnect CDP** from the Command Palette.
>>>>>>> 267387f8ebb147e46d4aed8c5a3f865e5233b899
