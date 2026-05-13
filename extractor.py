import os, re

logs_path = r'C:\Users\HFRC\.gemini\antigravity\brain\8c29323a-8e7b-4256-be94-1eee0a078f3f\.system_generated\steps'
found = False

for root, dirs, files in os.walk(logs_path):
    for f in files:
        fpath = os.path.join(root, f)
        try:
            with open(fpath, 'r', encoding='utf-8') as fh:
                content = fh.read()
                if 'P0_MAX_8K4K_REAL_COMPAT' in content:
                    match = re.search(r'\{[\s]*\"P0\":[\s]*\{', content)
                    if match:
                        start_index = match.start()
                        brace_count = 0
                        end_index = -1
                        for i in range(start_index, len(content)):
                            if content[i] == '{': brace_count += 1
                            elif content[i] == '}':
                                brace_count -= 1
                                if brace_count == 0:
                                    end_index = i + 1
                                    break
                        if end_index != -1:
                            with open(r'extracted_profiles.json', 'w', encoding='utf-8') as out:
                                # We need to wrap it in {} to make it valid json!
                                out.write('{' + content[start_index:end_index] + '}')
                            print(f'Extracted successfully from {fpath}')
                            found = True
                            exit(0)
        except Exception:
            pass

if not found:
    print('Failed to find JSON block.')
