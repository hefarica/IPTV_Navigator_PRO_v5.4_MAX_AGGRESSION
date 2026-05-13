import sys

def run():
    target_file = r'C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\frontend\js\ape-v9\m3u8-typed-arrays-ultimate.js'
    source_file = r'C:\Users\HFRC\Downloads\APE_796\GENERADOR_796_DEFINITIVO.js'
    
    with open(target_file, 'r', encoding='utf-8') as f:
        target_lines = f.readlines()
        
    with open(source_file, 'r', encoding='utf-8') as f:
        source_lines = f.readlines()
        
    start_idx = -1
    end_idx = -1
    for i, line in enumerate(target_lines):
        if line.strip().startswith('function build_kodiprop('):
            start_idx = i
            break
            
    for i in range(start_idx, len(target_lines)):
        if target_lines[i].strip().startswith('function generateM3U8Stream('):
            end_idx = i
            break

    # Extract new logic from source
    source_start = -1
    source_end = -1
    for i, line in enumerate(source_lines):
        if line.strip().startswith('function videoFilter(p)'):
            source_start = i
            break
    for i in range(source_start, len(source_lines)):
        if source_lines[i].strip().startswith('function generatePlaylist'):
            source_end = i
            break
            
    new_logic = "".join(source_lines[source_start:source_end])
    
    # We must patch md5() and sha256() in new_logic to use a fast JS hashing because crypto module is node only.
    fast_hash_funcs = """
    // --- OMEGA CRYSTAL 796 FAST CRYPTO REPLACEMENTS ---
    function pseudoHash(s, len) {
        let h = 0x811c9dc5;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24));
        }
        let hex = (h >>> 0).toString(16).padStart(8, '0');
        // Duplicate to fill length if necessary
        while(hex.length < len) { hex += hex; }
        return hex.substring(0, len);
    }
    function md5(s) { return pseudoHash(s, 32); }
    function sha256(s) { return pseudoHash(s, 64); }
    function rand8() { return pseudoHash(Math.random().toString(), 8); }
    const GLOBAL_SEED   = "OMEGA_CRYSTAL_V5_" + Date.now();
    const LIST_HASH     = md5(GLOBAL_SEED).substring(0, 8);
    const TIMESTAMP     = new Date().toISOString();
    
    // API Resolver Backend override
    const RESOLVER_BASE = "http://iptv-ape.duckdns.org/resolve_quality_unified.php";
    
"""
    
    generate_channel_entry = """
    function generateChannelEntry(channel, index, forceProfile = null, credentialsMap = {}) {
        const originalProfile = forceProfile || determineProfile(channel);
        let profile = originalProfile;
        
        // â”€â”€ ðŸ‘ ï¸  IPTV-SUPPORT-CORTEX vÎ©: OVERWRITE NUCLEAR â”€â”€
        if (typeof window !== 'undefined' && window.IPTV_SUPPORT_CORTEX_V_OMEGA) {
            let cfg = getProfileConfig(profile);
            const result = window.IPTV_SUPPORT_CORTEX_V_OMEGA.execute(cfg, profile, channel.name || '');
            profile = result.profile;
        }

        // Recuperar perfil desde PROFILES provistos por OMEGA 796 (P0-P5) o fallback a P3
        let p_cfg = PROFILES[profile] || PROFILES['P3'];

        // Llamada al bloque monolÃ­tico 796
        const linesArray = buildChannelBlock(channel, p_cfg, index);
        
        // El array 796 ya incorpora URL FINAL pero carece de la de credenciales si estamos en modo JWT.
        // REGLA: El script original del ZIP hace lines.push(`${RESOLVER_BASE}?ch=...`) al final.
        // Construimos el array como String y lo devolvemos
        return linesArray.join('\\n');
    }
"""
    
    # We replace `ch.id` in buildChannelBlock with `(ch.stream_id || ch.id || index)`
    # And we replace ch.url with something safe if undefined.
    new_logic = new_logic.replace('ch.id', '(ch.stream_id || ch.id || ("ch-"+index))')
    new_logic = new_logic.replace('ch.name', '(ch.name || "")')
    new_logic = new_logic.replace('ch.logo', '(ch.logo || "")')
    new_logic = new_logic.replace('ch.group', '(ch.group || "")')
    new_logic = new_logic.replace('ch.url', '(ch.url || "")')
    
    replacement = fast_hash_funcs + new_logic + generate_channel_entry + "\n\n"
    
    target_lines = target_lines[:start_idx] + [replacement] + target_lines[end_idx:]
    
    with open(target_file, 'w', encoding='utf-8') as f:
        f.writelines(target_lines)
    
    print("Integration complete!")

if __name__ == '__main__':
    run()
