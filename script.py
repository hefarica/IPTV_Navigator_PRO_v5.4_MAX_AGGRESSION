import json, re

js_file = r"c:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\frontend\js\ape-v9\ape-profiles-config.js"
json_file = r"C:\Users\HFRC\Downloads\APE_OMEGA_PROFILES_P0_P5_v10.1_FIXED.json"

with open(json_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

with open(js_file, 'r', encoding='utf-8') as f:
    js_content = f.read()

for profile in ["P0", "P1", "P2", "P3", "P4", "P5"]:
    if profile in data:
        prof_data = data[profile]
        headers = prof_data.get("headers", {})
        
        headers_lines = []
        for k, v in headers.items():
            k_esc = k.replace('"', '\\"')
            v_esc = v.replace('"', '\\"').replace('\n', '')
            headers_lines.append(f'                "{k_esc}": "{v_esc}"')
        
        headers_str = "{\n" + ",\n".join(headers_lines) + "\n            }"
        
        # Regex to match the headerOverrides block inside the specific profile
        # Specifically matches: headerOverrides: { ... }
        # Let's refine the regex using lookbehind or specific markers
        
        regex = r'(' + profile + r':\s*\{[\s\S]*?headerOverrides:\s*)\{[\s\S]*?\}'
        
        # Wait! The [ \S]*? might be too slow or greedy.
        # We can write a custom safe replacer:
        pattern = re.compile(regex)
        match = pattern.search(js_content)
        if match:
            # Reconstruct the string
            js_content = js_content[:match.end(1)] + headers_str + js_content[match.end():]
            print(f"Patched {profile} successfully.")
        else:
            print(f"Could not find headerOverrides dynamically for {profile}.")

with open(js_file, 'w', encoding='utf-8') as f:
    f.write(js_content)

print("Modification complete.")
