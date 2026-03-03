#!/bin/bash

echo "🚀 Antigravity Autorun Builder & Publisher"
echo "--------------------------------"
echo "Select version bump type:"
echo "1) Patch (1.0.x -> 1.0.x+1) - For bug fixes"
echo "2) Minor (1.x.0 -> 1.x+1.0) - For new features"
echo "3) Major (x.0.0 -> x+1.0.0) - For breaking changes"
echo "4) Skip version bump (Just package/publish)"
echo "--------------------------------"
read -p "Enter choice [1-4]: " choice

case $choice in
    1) npm version patch --no-git-tag-version ;;
    2) npm version minor --no-git-tag-version ;;
    3) npm version major --no-git-tag-version ;;
    4) echo "Skipping version bump..." ;;
    *) echo "Invalid choice. Exiting."; exit 1 ;;
esac

echo "📦 Cleaning old .vsix files..."
rm -f *.vsix

echo "📦 Packaging extension..."
npx vsce package

VSIX_FILE=$(ls *.vsix | head -n 1)

if [ -z "$VSIX_FILE" ]; then
    echo "❌ Error: VSIX file was not generated."
    exit 1
fi

echo "--------------------------------"
echo "Do you want to publish the extension?"
echo "This requires OVSX_TOKEN in .env file."
read -p "Publish? (y/n): " publish_choice

if [[ "$publish_choice" =~ ^[Yy]$ ]]; then
    if [ -f .env ]; then
        # Export variables from .env
        export $(grep -v '^#' .env | xargs)

        # Publish to Open VSX Registry
        if [ -n "$OVSX_TOKEN" ]; then
            echo "🚀 Publishing $VSIX_FILE to Open VSX Registry..."
            npx ovsx publish "$VSIX_FILE" -p "$OVSX_TOKEN"
            echo "✅ Open VSX publish complete!"
        else
            echo "⏭️  OVSX_TOKEN not found in .env file. Skipping Open VSX publish."
        fi
    else
        echo "❌ .env file not found. Skipping publish."
    fi
else
    echo "Skipping publish."
fi

echo "✅ Build process complete!"
