import os

def process_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception:
        return

    og_content = content
    content = content.replace('network-caching-dscp=56', 'network-caching-dscp=0')
    content = content.replace('network-caching-dscp-qos=56', 'network-caching-dscp-qos=0')
    content = content.replace('dscp=56', 'dscp=0')
    content = content.replace('#EXTVLCOPT:repeat=100', '// #EXTVLCOPT:repeat=100 (REMOVED: duplicated)')

    if content != og_content:
        print(f"Updated {filepath}")
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

for root, dirs, files in os.walk('.'):
    for name in files:
        if name.endswith('.php') or name.endswith('.js'):
            if '.bak' in name: continue
            process_file(os.path.join(root, name))
