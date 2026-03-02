import os

extensions = ['.ts', '.json', '.md']

for root, dirs, files in os.walk('.'):
    # Skip standard exclude directories
    if any(exclude in root for exclude in ['node_modules', '.git', 'out']):
        continue
        
    for f in files:
        if not any(f.endswith(ext) for ext in extensions):
            continue
        if f in ['package-lock.json', 'rename.py']:
            continue
            
        path = os.path.join(root, f)
        
        try:
            with open(path, 'r', encoding='utf-8') as file:
                content = file.read()
            
            # Replacements
            old_content = content
            content = content.replace('antigravity-auto-accept', 'antigravity-autorun')
            # Order matters to avoid overlapping replacements
            content = content.replace('Auto Accept', 'Autorun')
            content = content.replace('Auto-Accept', 'Autorun')
            content = content.replace('auto-accept', 'autorun')
            content = content.replace('antigravityAutoAccept', 'antigravityAutorun')
            content = content.replace('autoAccept', 'autorun')
            content = content.replace('AutoAccept', 'Autorun')
            
            if content != old_content:
                with open(path, 'w', encoding='utf-8') as file:
                    file.write(content)
                print(f"Updated {path}")
        except Exception as e:
            print(f"Error processing {path}: {e}")
