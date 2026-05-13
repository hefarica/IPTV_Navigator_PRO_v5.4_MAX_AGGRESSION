--[[
    VLC Lua HW Overdrive & Throttling Evasion Script
    Arquitectura IPTV Indetectable 2026
    
    Instrucciones de Instalación:
    1. Copiar este archivo a:
       - Windows: %APPDATA%\vlc\lua\extensions\
       - Linux/Mac: ~/.local/share/vlc/lua/extensions/
--]]

function descriptor()
    return {
        title = "APE HW Overdrive 2026",
        version = "1.0",
        author = "IPTV Navigator PRO",
        url = "https://ape.net",
        shortdesc = "Hardware decoding bypass and 2000ms cache lockdown",
        description = "Obliga el uso de DXVA2/MediaCodec, desactiva loop deblocking y fuerza QoS anti-403",
        capabilities = {"input-listener", "playing-listener"}
    }
end

function activate()
    vlc.msg.info("[APE-OVERDRIVE] Modulo activado. Escuchando nuevos flujos IPTV de red.")
    apply_god_tier_settings()
end

function deactivate()
    vlc.msg.info("[APE-OVERDRIVE] Modulo desactivado.")
end

function apply_god_tier_settings()
    -- Configuración forzada de Caché a 2000ms para evadir ISP bursts (Tunnel Shaping)
    vlc.var.set(vlc.object.libvlc(), "network-caching", 2000)
    vlc.var.set(vlc.object.libvlc(), "file-caching", 2000)
    vlc.var.set(vlc.object.libvlc(), "live-caching", 2000)
    vlc.var.set(vlc.object.libvlc(), "sout-mux-caching", 2000)
    
    -- HW Decoding Obligatorio (Reduce sobrecarga de CPU y protege descriptores L7)
    vlc.var.set(vlc.object.libvlc(), "avcodec-hw", "any") -- Busca DXVA2, VAAPI, o MediaCodec puro
    vlc.var.set(vlc.object.libvlc(), "avcodec-threads", 4) -- Paralelismo extremo HEVC
    
    -- Aniquilación del Filtro de Deblocking de H264/HEVC
    -- Valor 4 (Skip All) -> Transfiere carga masiva de CPU 
    vlc.var.set(vlc.object.libvlc(), "avcodec-skiploopfilter", 4)
    vlc.var.set(vlc.object.libvlc(), "avcodec-fast", true)

    -- Evasión HTTP Anti 403 y CDN Spoofing
    vlc.var.set(vlc.object.libvlc(), "http-referrer", "https://www.google.com/")
    vlc.var.set(vlc.object.libvlc(), "http-user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
    vlc.var.set(vlc.object.libvlc(), "http-reconnect", true)
    
    vlc.msg.info("[APE-OVERDRIVE] Directivas de Evasión HW y Caché inyectadas con éxito.")
end

function meta_changed()
    return false
end

function playing_changed()
    if vlc.playlist.status() == "playing" then
        vlc.msg.dbg("[APE-OVERDRIVE] Se detecta reproducción. Asegurando directivas L7...")
        apply_god_tier_settings()
    end
end
