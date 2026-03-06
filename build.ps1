Write-Host "🚀 Antigravity Autorun Builder & Publisher"
Write-Host "--------------------------------"
Write-Host "Select version bump type:"
Write-Host "1) Patch (1.0.x -> 1.0.x+1) - For bug fixes"
Write-Host "2) Minor (1.x.0 -> 1.x+1.0) - For new features"
Write-Host "3) Major (x.0.0 -> x+1.0.0) - For breaking changes"
Write-Host "4) Skip version bump (Just package/publish)"
Write-Host "--------------------------------"

$choice = Read-Host "Enter choice [1-4]"

switch ($choice) {
    '1' { wsl -d Ubuntu-24.04 -e bash -c "cd /home/skawn1057/Development/antigravity-autorun && npm version patch --no-git-tag-version" }
    '2' { wsl -d Ubuntu-24.04 -e bash -c "cd /home/skawn1057/Development/antigravity-autorun && npm version minor --no-git-tag-version" }
    '3' { wsl -d Ubuntu-24.04 -e bash -c "cd /home/skawn1057/Development/antigravity-autorun && npm version major --no-git-tag-version" }
    '4' { Write-Host "Skipping version bump..." }
    Default { Write-Host "Invalid choice. Exiting."; exit }
}

Write-Host "📦 Cleaning old .vsix files..."
Remove-Item -Path ".\*.vsix" -ErrorAction SilentlyContinue

Write-Host "📦 Packaging extension..."
wsl -d Ubuntu-24.04 -e bash -c "cd /mnt/c/Users/skawn/Development/antigravity-autorun && npx vsce package"

$vsixFile = Get-ChildItem -Path ".\*.vsix" | Select-Object -First 1

if (-not $vsixFile) {
    Write-Host "❌ Error: VSIX file was not generated." -ForegroundColor Red
    exit
}

Write-Host "--------------------------------"
Write-Host "Do you want to publish the extension?"
Write-Host "This requires OVSX_TOKEN (Open VSX Registry) in .env file."
$publish_choice = Read-Host "Publish? (y/n)"

if ($publish_choice -match "^[Yy]$") {
    $envFilePath = Join-Path $PSScriptRoot ".env"
    
    if (Test-Path $envFilePath) {
        $envContent = Get-Content -Path $envFilePath
        $ovsxToken = $null
        
        foreach ($line in $envContent) {
            if ($line -match "^OVSX_TOKEN=(.*)$") {
                $ovsxToken = $matches[1]
            }
        }
        
        # Publish to Open VSX Registry
        if ($ovsxToken) {
            Write-Host "🚀 Publishing $($vsixFile.Name) to Open VSX Registry..."
            wsl -d Ubuntu-24.04 -e bash -c "cd /mnt/c/Users/skawn/Development/antigravity-autorun && npx ovsx publish `"$($vsixFile.Name)`" -p $ovsxToken"
            Write-Host "✅ Open VSX publish complete!" -ForegroundColor Green
        } else {
            Write-Host "⏭️  OVSX_TOKEN not found in .env file. Skipping Open VSX publish." -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ .env file not found. Skipping publish." -ForegroundColor Red
    }
} else {
    Write-Host "Skipping publish."
}

Write-Host "✅ Build process complete!"
