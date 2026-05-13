import re

filepath = 'c:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Add require
if 'ape_phantom_engine.php' not in content:
    content = re.sub(
        r'(if \(file_exists\(__DIR__ \. "/rq_anti_cut_engine\.php"\)\) \{\n.*?})',
        r'\1\nif (file_exists(__DIR__ . "/ape_phantom_engine.php")) {\n    require_once __DIR__ . "/ape_phantom_engine.php";\n}',
        content,
        flags=re.DOTALL
    )

# Fix rq_fetch inside the context creation:
# 'User-Agent: ResolveQuality/' . RQ_VERSION, -> Replace
new_ua_logic = """
'User-Agent: ' . (class_exists('UAPhantomEngine') 
    ? UAPhantomEngine::getForChannel(abs(crc32(get_correlated_channel_id())), get_correlated_channel_id()) 
    : 'ResolveQuality/' . RQ_VERSION),
"""
content = re.sub(r"'User-Agent:\s*ResolveQuality/'\s*\.\s*RQ_VERSION,", new_ua_logic.strip(), content)

# There is a Recovery section? Wait, 407 / 403 / 429 recovery happens in Sniper Mode or Fetch?
# Sniper mode is in 'rq_sniper_mode.php'. Let's also patch it!
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("resolve_quality_unified.php updated successfully.")
