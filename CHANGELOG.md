# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0] - 2026-03-02

### Fixed
- Fixed CDP connection to target Launchpad (Agent panel) instead of workbench
- Run/Accept buttons are now properly detected

### Added
- Priority-based target selection: Launchpad > jetski-agent > workbench

## [1.1.0] - 2026-03-02

### Added
- Auto-restart Antigravity with CDP mode when connection fails
- "Yes, Restart" prompt on CDP connection failure
- `restartWithCDP` command for manual restart

### Fixed
- Better error handling for CDP connection

## [1.0.0] - 2026-03-02

### Added
- Initial release
- Auto-click Run, Accept, Accept All, Confirm, Allow buttons
- MutationObserver-based button detection
- Auto-scroll for hidden buttons
- Blocked commands list (rm -rf, sudo, etc.)
- Status bar toggle (Auto: ON/OFF)
- CDP connection management
- Configurable CDP port, delay, auto-scroll
