# Antigravity Autorun

> **True hands-free automation for Antigravity AI Agent**

Automatically approves **Run**, **Confirm**, and **Allow** commands in Antigravity IDE using Chrome DevTools Protocol (CDP).

---

## 🚀 Features

### **One-Click CDP Setup (Windows Only)**
- Click "Restart Editor Now" button when prompted to auto-restart the editor in CDP mode.
- Uses WMI detached processes to ensure reliable, clean environment re-launches.
- No manual configuration needed.

### **One-Click CDP Setup**
- Click "Launch CDP Mode" button to create desktop shortcut
- Double-click shortcut to start Antigravity with CDP enabled
- No manual configuration needed

### **Smart Safety**
- Blocks dangerous commands (`rm -rf`, `sudo`, etc.)
- Toggle ON/OFF via status bar
- Network-level interception — stable & reliable

---

## 📦 Installation

### Open VSX Registry
```bash
code --install-extension njk.antigravity-autorun
```

### Manual Installation
1. Download `.vsix` from [Releases](https://github.com/yourusername/antigravity-autorun/releases)
2. `Extensions: Install from VSIX...` in Command Palette

---

## 🎯 Quick Start (Windows)

1. **Install extension**
2. **Click "Restart Editor Now"** when prompted to automatically relaunch with CDP.
3. Look for **`✓ Auto: ON`** in status bar
4. Start using Antigravity Agent — interactions are auto-approved!

> ⚠️ **Note:** The auto-relaunch feature is currently fully supported on **Windows only**. Mac/Linux users must start Antigravity explicitly with the `--remote-debugging-port=9222` flag.

---

## 🎛️ Status Bar

| Icon | Meaning |
|------|---------|
| `✓ Auto: ON` | Active — auto-approving interactions |
| `⊘ Auto: OFF` | Disabled — click to enable |
| `↻ Connecting...` | Reconnecting to CDP |
| `⊗ Error` | CDP connection failed — click for help |

---

## ⚙️ Commands

- `Antigravity Autorun: Toggle ON/OFF`
- `Antigravity Autorun: Reconnect CDP`
- `Antigravity Autorun: Relaunch with CDP Mode`
- `Antigravity Autorun: Diagnostic Log`

---

## 🔧 Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `antigravityAutorun.enabled` | `true` | Enable on startup |
| `antigravityAutorun.cdpPort` | `9222` | Chrome DevTools Protocol port |
| `antigravityAutorun.blockedCommands` | `["rm -rf /", ...]` | Never auto-approve these |

---

## 📝 How It Works

1. **Network Sniffing**: Uses CDP Network Domain to intercept WebSocket messages
2. **Pattern Matching**: Detects `HandleCascadeUserInteraction` packets
3. **Direct API Call**: Sends approval via backend REST API
4. **Zero Dependency**: No DOM observation, no mouse simulation

**Architecture:**
```
Antigravity Agent → Backend API → WebSocket → CDP Network Sniffer
                                              ↓
                                         Instant Approval
```

---

## 🐛 Troubleshooting

### "CDP is disabled" error
1. Click **"Restart Editor Now"** button on the prompt to auto-relaunch.

### Still not working?
1. Check `%TEMP%\\antigravity_relaunch.log` for any auto-restart errors.
2. Run `Antigravity Autorun: Diagnostic Log`
3. Check output for errors
4. Report issue with log output
1. Run `Antigravity Autorun: Diagnostic Log`
2. Check output for errors
3. Report issue with log output

---

## 📋 Requirements

- **Antigravity IDE** (VSCode fork with AI Agent)
- **Windows OS** (VBScript/PowerShell WMI used for background launcher)
- **CDP Port Access** (default: 9222)

---

## 📜 Release Notes

### 3.2.1 (Windows Only)
- **[PERFORMANCE]** Rewrote the Windows auto-restart launcher completely in Go (`relauncher.exe`).
- **[PERFORMANCE]** Replaced the clunky 3-layer VBS->PowerShell->WMI wrapper with an uncompromising 1MB native executable calling Win32 `sysCall.CreateProcess`.
- **[FIX]** Solved the 4-6 second restart delay. The editor now restarts almost instantly in CDP mode without environment variable poisoning.

### 3.1.0 (Windows Only)
- **[NEW]** Fully automated "Restart Editor Now" button using WMI detached background process.
- **[REMOVED]** Deprecated Setup Instructions and shortcut creation guides.

### 3.0.22
- **[NEW]** Desktop shortcut creation for CDP mode
- **[NEW]** All messages in English
- **[FIX]** Improved .exe path detection (prioritize over .cmd)
- **[FIX]** Stale DevToolsActivePort file cleanup

### 3.0.0
- **[MAJOR]** Complete rewrite using CDP Network API
- **[PERFORMANCE]** 0ms approval latency
- **[STABILITY]** Immune to DOM/CSS changes

---

## 📄 License

MIT © 2024

---

## 🔗 Links

- [GitHub Repository](https://github.com/yourusername/antigravity-autorun)
- [Report Issues](https://github.com/yourusername/antigravity-autorun/issues)
- [Changelog](CHANGELOG.md)

---

**Made for Antigravity AI Agent users who want true hands-free automation** ✨
