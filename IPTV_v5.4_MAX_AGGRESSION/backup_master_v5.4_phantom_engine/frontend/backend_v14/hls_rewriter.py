import re
from urllib.parse import urljoin

class HLSRewriter:
    """
    Motor de Reescritura HLS para APE v14 SUPREME.
    Responsable de absolutizar URLs y redirigir segmentos al proxy.
    """
    
    def __init__(self, proxy_base_url):
        self.proxy_base_url = proxy_base_url

    def rewrite_manifest(self, content, origin_url, channel_id, profile, profile_config):
        """
        Reescribe un manifest M3U8 para absolutizar URLs y añadir tags APE.
        """
        lines = content.splitlines()
        new_lines = []
        
        # Inyectar Headers APE al inicio
        if lines and lines[0].startswith("#EXTM3U"):
            new_lines.append("#EXTM3U")
            new_lines.append(f"#EXT-X-APE-PROFILE:{profile}")
            new_lines.append(f"#EXT-X-APE-LEVEL:{profile_config.get('level', 'N/A')}")
            new_lines.append(f"#EXT-X-APE-BUFFER-LIVE:{profile_config.get('buffer_live', 2000)}")
            new_lines.append(f"#EXT-X-APE-BUFFER-VOD:{profile_config.get('buffer_vod', 10000)}")
            
            # Quitar la primera línea ya procesada
            lines = lines[1:]
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            # Si es una línea de comentario/tag, mantenerla (a menos que queramos modificarla)
            if line.startswith("#"):
                # Opcional: Modificar TARGETDURATION o similar si es necesario
                new_lines.append(line)
                continue
            
            # Si es una URL (segmento o sub-playlist)
            absolute_url = urljoin(origin_url, line)
            
            # Redirigir a nuestro proxy de segmentos
            # Formato: /segment?ch={ID}&profile={P}&url={URL_ENCODED}
            # Por ahora lo mantenemos simple para el prototype
            proxy_url = f"{self.proxy_base_url}/segment?ch={channel_id}&profile={profile}&uri={absolute_url}"
            new_lines.append(proxy_url)
            
        return "\n".join(new_lines)

    def is_master_playlist(self, content):
        """Detecta si es una Master Playlist (variantes) o Media Playlist (segmentos)"""
        return "#EXT-X-STREAM-INF" in content
