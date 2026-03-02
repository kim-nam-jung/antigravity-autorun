# Antigravity Auto Accept

> True hands-free automation for your Antigravity Agent

Automatically clicks **Run**, **Accept**, **Accept All**, **Confirm**, and **Allow** buttons in Google Antigravity IDE.

## Features

- **Auto-click buttons**: Run, Accept, Accept All, Confirm, Allow
- **MutationObserver-based**: Instant detection when buttons appear
- **Auto-scroll**: Clicks hidden buttons by scrolling them into view
- **Dangerous command blocking**: Prevents auto-accepting `rm -rf`, `sudo`, etc.
- **Status bar toggle**: One-click ON/OFF
- **Auto-restart**: Restarts Antigravity with CDP mode if not enabled

## Requirements

Antigravity must be running with **CDP (Chrome DevTools Protocol)** enabled:

```bash
antigravity --remote-debugging-port=9222
```

Or use the extension's auto-restart feature when prompted.

## Usage

1. Install the extension
2. If CDP is not enabled, click **"Yes, Restart"** when prompted
3. Look for **`Auto: ON`** in the status bar
4. Start using Antigravity Agent - buttons will be clicked automatically!

### Status Bar

| Status | Meaning |
|--------|---------|
| `✓ Auto: ON` | Active - buttons will be auto-clicked |
| `⊘ Auto: OFF` | Disabled - click to enable |
| `⊗ Auto: Error` | CDP connection failed |

## Commands

- `Antigravity Auto Accept: Toggle ON/OFF` - Toggle auto-accept
- `Antigravity Auto Accept: Reconnect CDP` - Reconnect to CDP
- `Antigravity Auto Accept: Restart Antigravity with CDP` - Restart with CDP enabled

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `antigravityAutoAccept.enabled` | `true` | Enable on startup |
| `antigravityAutoAccept.cdpPort` | `9222` | CDP port |
| `antigravityAutoAccept.delay` | `100` | Click delay (ms) |
| `antigravityAutoAccept.autoScroll` | `true` | Scroll to hidden buttons |
| `antigravityAutoAccept.blockedCommands` | `["rm -rf /", ...]` | Never auto-accept these |

## Safety

This extension blocks dangerous commands by default:
- `rm -rf /`
- `sudo rm`
- `format`
- `del /`

Add more in settings: `antigravityAutoAccept.blockedCommands`

## Known Issues

- Requires Antigravity to be started with `--remote-debugging-port=9222`
- May need to reconnect after Antigravity updates

## Release Notes

### 1.2.0
- Fixed CDP connection to target Launchpad (Agent panel)
- Buttons are now properly detected

### 1.1.0
- Added auto-restart with CDP mode
- Better error handling

### 1.0.0
- Initial release

## License

MIT
