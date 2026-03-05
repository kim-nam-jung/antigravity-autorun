# Antigravity Autorun

> **True hands-free automation for Antigravity AI Agent**

Automatically approves **Run**, **Accept**, **Confirm**, and **Allow** commands in Antigravity IDE using Chrome DevTools Protocol (CDP).

---

## 🚀 Features

### **Zero-Latency API Approvals**
- Intercepts `HandleCascadeUserInteraction` packets at the network level
- Direct REST API calls to backend — **0ms delay**
- Immune to CSS/DOM changes

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

## 🎯 Quick Start

1. **Install extension**
2. **Click "Launch CDP Mode"** when prompted
3. **Close Antigravity and double-click the desktop shortcut**
4. Look for **`✓ Auto: ON`** in status bar
5. Start using Antigravity Agent — interactions are auto-approved!

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
- `Antigravity Autorun: Launch CDP Mode`
- `Antigravity Autorun: Diagnostic Log`
- `Antigravity Autorun: Setup Instructions`

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
1. Click **"Launch CDP Mode"** button
2. Close current Antigravity
3. Use desktop shortcut to restart

### Desktop shortcut not working
1. Open Command Palette (`Ctrl+Shift+P`)
2. Run `Antigravity Autorun: Setup Instructions`
3. Follow manual setup guide

### Still not working?
1. Run `Antigravity Autorun: Diagnostic Log`
2. Check output for errors
3. Report issue with log output

---

## 📋 Requirements

- **Antigravity IDE** (VSCode fork with AI Agent)
- **Windows** (PowerShell for CDP launcher)
- **CDP Port Access** (default: 9222)

---

## 📜 Release Notes

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
