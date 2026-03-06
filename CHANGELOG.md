# Changelog

All notable changes to the Antigravity Autorun extension.

## [3.2.2] - 2026-03-07

### Documentation
- Updated README and Changelog to reflect Go migration changes

## [3.2.1] - 2026-03-07

### Fixed
- Fixed Go executable Windows creation flag conflict (`parameter is incorrect`)
- Custom environment variable filtering instead of wiping `SysProcAttr.Env`

## [3.2.0] - 2026-03-07

### Performance
- Completely rewrote the Windows Background Launcher in Go (`relauncher.exe`)
- Bypassed 4-6 second PowerShell loading overhead completely
- Native Win32 API (`CreateProcess`) execution with `DETACHED_PROCESS` flag

## [3.1.0] - 2026-03-06

### Added
- Fully automated "Restart Editor Now" button click.
- WMI detached process fallback to bypass VSCode Job Objects

### Removed
- Deprecated Setup Instructions and shortcut creation guides


## [3.0.22] - 2024-03-05

### Added
- Desktop shortcut creation for CDP mode
- "Launch CDP Mode" button
- All messages in English

### Changed
- Prioritize .exe over .cmd detection
- Improved error handling

### Fixed
- Stale DevToolsActivePort cleanup
- PowerShell command escaping
- Single-instance lock handling

## [3.0.0] - 2024-02-25

### Added
- CDP Network Domain sniffing
- Direct REST API approvals
- Zero-latency architecture

### Changed
- Complete rewrite from DOM to Network API
- 0ms approval latency

### Removed
- DOM-based ButtonClicker
- Mouse simulation
