import os
import sys

def check_balanced_brackets(filepath):
    if not os.path.exists(filepath):
        print(f"Error: {filepath} not found.")
        return False
        
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
        
    stack = []
    mapping = {')': '(', '}': '{', ']': '['}
    lines = content.splitlines()
    
    # We want to skip string literals to avoid counting bracket characters inside quotes
    in_string = False
    in_char = False
    string_char = None
    in_comment_single = False
    in_comment_multi = False
    
    for line_idx, line in enumerate(lines):
        line_num = line_idx + 1
        char_idx = 0
        in_comment_single = False
        while char_idx < len(line):
            c = line[char_idx]
            
            # Multi-line comment check
            if in_comment_multi:
                if c == '*' and char_idx + 1 < len(line) and line[char_idx + 1] == '/':
                    in_comment_multi = False
                    char_idx += 2
                else:
                    char_idx += 1
                continue
                
            # Single-line comment check
            if in_comment_single:
                break
                
            # String literals check
            if in_string:
                if c == '\\':
                    char_idx += 2 # skip escaped character
                elif c == string_char:
                    in_string = False
                    char_idx += 1
                else:
                    char_idx += 1
                continue
                
            # Comments start check
            if c == '/' and char_idx + 1 < len(line):
                if line[char_idx + 1] == '/':
                    in_comment_single = True
                    char_idx += 2
                    continue
                elif line[char_idx + 1] == '*':
                    in_comment_multi = True
                    char_idx += 2
                    continue
            
            # String start check
            if c in ("'", '"'):
                in_string = True
                string_char = c
                char_idx += 1
                continue
                
            # Bracket logic
            if c in mapping.values():
                stack.append((c, line_num, char_idx))
            elif c in mapping.keys():
                if not stack:
                    print(f"[{filepath}] FAIL: Unmatched closing bracket '{c}' at line {line_num}, char {char_idx}")
                    return False
                top, top_line, top_char = stack.pop()
                if top != mapping[c]:
                    print(f"[{filepath}] FAIL: Mismatched brackets: opened '{top}' at line {top_line} but closed with '{c}' at line {line_num}")
                    return False
            char_idx += 1
            
    if stack:
        top, top_line, top_char = stack[-1]
        print(f"[{filepath}] FAIL: Unmatched open bracket '{top}' at line {top_line} (stack size {len(stack)})")
        return False
        
    print(f"[{filepath}] PASS: Brackets balanced.")
    return True

if __name__ == "__main__":
    files = [
        "cmaf_engine/modules/graceful_degradation_engine.php",
        "cmaf_engine/modules/hdr10plus_dynamic_engine.php",
        "cmaf_engine/modules/neuro_buffer_controller.php",
        "resolve_quality_unified.php",
        "v7_fase3/graceful_degradation_engine.php",
        "v7_fase3/hdr10plus_dynamic_engine.php",
        "v7_fase3/neuro_buffer_controller.php"
    ]
    
    # Get parent directory of script (which is backend/)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.abspath(os.path.join(script_dir, ".."))
    failed = False
    for f in files:
        full_path = os.path.join(backend_dir, f)
        if not os.path.exists(full_path):
            print(f"Error: {full_path} not found.")
            failed = True
            continue
            
        if not check_balanced_brackets(full_path):
            failed = True
            
    if failed:
        sys.exit(1)
    else:
        sys.exit(0)
