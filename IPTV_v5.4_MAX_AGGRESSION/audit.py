import re

path = 'C:/Users/HFRC/Downloads/APE_TYPED_ARRAYS_ULTIMATE_20260404 (4).m3u8'
try:
    with open(path, 'r', encoding='utf-8') as f:
        channels = f.read().split('#EXTINF:')
        if len(channels) > 1:
            ch1 = channels[1]
            exthttp = re.search(r'#EXTHTTP:(.*)', ch1)
            extvlc = re.search(r'#EXTVLCOPT:http-user-agent=(.*)', ch1)
            kodiprop = re.search(r'#KODIPROP:inputstream\.adaptive\.user_agent=(.*)', ch1)
            filters = re.search(r'video-filter=(.*)', ch1)
            dscp = re.search(r'network-caching-dscp', ch1)
            
            ua_http = ''
            if exthttp:
                import json
                try:
                    j = json.loads(exthttp.group(1))
                    ua_http = j.get('User-Agent', '')
                except: pass
            
            ua_vlc = extvlc.group(1) if extvlc else ''
            ua_kodi = kodiprop.group(1) if kodiprop else ''
            
            print(f'Total Channels: {len(channels)-1}')
            print('--- Channel 1 Audit ---')
            print(f'EXTHTTP UA: {ua_http}')
            print(f'EXTVLC UA: {ua_vlc}')
            print(f'KODI UA: {ua_kodi}')
            print(f'SYNC MATCH: {ua_http == ua_vlc == ua_kodi and ua_http != ""}')
            print(f'FILTERS: {filters.group(1) if filters else "None found"}')
            print(f'HAS DSCP: {dscp is not None}')

            ch2 = channels[2]
            exthttp2 = re.search(r'#EXTHTTP:(.*)', ch2)
            ua_http2 = ''
            if exthttp2:
                import json
                try:
                    j = json.loads(exthttp2.group(1))
                    ua_http2 = j.get('User-Agent', '')
                except: pass
            print(f'CHANNEL 2 UA: {ua_http2}')
            print(f'ROTATES: {ua_http != ua_http2}')

        else:
            print('No channels found or parse error.')
except Exception as e:
    print('Error:', e)
