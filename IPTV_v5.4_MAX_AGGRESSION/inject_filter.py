import os
import re

god_tier_chain = "video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full"

# regex to find video-filter= followed by any chars except quote or newline
pattern = re.compile(r'video-filter=[^''"`\r\n]+')

def process_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        try:
            with open(filepath, 'r', encoding='ISO-8859-1') as f:
                content = f.read()
        except:
            return

    new_content = pattern.sub(god_tier_chain, content)
    
    if new_content != content:
        print(f"Updated {filepath}")
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)

for root, dirs, files in os.walk('.'):
    for name in files:
        if name.endswith('.php') or name.endswith('.js'):
            if '.bak' in name: continue
            process_file(os.path.join(root, name))
