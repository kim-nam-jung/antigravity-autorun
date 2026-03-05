# Publishing to Open VSX

## Prerequisites

1. Create account at https://open-vsx.org/
2. Get Personal Access Token from https://open-vsx.org/user-settings/tokens

## Publish Command

```bash
npx ovsx publish antigravity-autorun-3.0.23.vsix -p YOUR_ACCESS_TOKEN
```

## Or install ovsx globally

```bash
npm install -g ovsx
ovsx publish antigravity-autorun-3.0.23.vsix -p YOUR_ACCESS_TOKEN
```

## Verify

After publishing, check: https://open-vsx.org/extension/njk/antigravity-autorun

## Future Updates

```bash
npm version patch  # 3.0.23 -> 3.0.24
npm run package
ovsx publish antigravity-autorun-VERSION.vsix -p YOUR_TOKEN
```
