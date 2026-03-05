#!/bin/bash
set -e

# 1. Import에 deleteStaleDevToolsPortFile 추가
sed -i "3s/checkDevToolsPortStatus } from/checkDevToolsPortStatus, deleteStaleDevToolsPortFile } from/" src/extension.ts

# 2. log 라인 바로 뒤에 deleteStaleDevToolsPortFile() 추가
sed -i "/Executable Path.*exePath/a\  deleteStaleDevToolsPortFile();" src/extension.ts

# 3. psCommand 라인을 psScript + encoded로 교체
sed -i "/const psCommand.*LOCALAPPDATA/c\  const psScript = \`Start-Process -FilePath \"${exePath}\" -ArgumentList \"--user-data-dir=%LOCALAPPDATA%\\\\Temp\\\\AgCDPProfile\",\"--remote-debugging-port=${cdpPort}\"\`;\n  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');" src/extension.ts

# 4. spawn의 -Command를 -EncodedCommand로 변경
sed -i 's/-NonInteractive,
