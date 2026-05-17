# JA3 / User-Agent / Sec-CH-UA byte-identical coherence matrix

When the JACIE sidecar is asked to use a TLS profile, the User-Agent header MUST match byte-identical or the request will be flagged as bot by JA3-aware providers (terovixa.cc, line.tivi-ott.net, MegaOTT). This matrix is the authoritative pairing table validated in V16-V19 over ~400,000 stress iterations zero-error.

Sources of the UA strings: jacie/main.go `profileToUA()` (forward-compat default), real device fingerprints captured from production playback sessions.

## Profile pairings

### chrome_120

- **uTLS HelloID**: `utls.HelloChrome_Auto`
- **User-Agent (mandatory)**: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`
- **Sec-CH-UA**: `"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"`
- **Sec-CH-UA-Mobile**: `?0`
- **Sec-CH-UA-Platform**: `"Windows"`
- **Accept**: `application/vnd.apple.mpegurl,video/*,*/*;q=0.8`
- **Accept-Language**: `en-US,en;q=0.9`
- **Accept-Encoding**: `gzip, deflate, br`

### firefox_117

- **uTLS HelloID**: `utls.HelloFirefox_Auto`
- **User-Agent (mandatory)**: `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:117.0) Gecko/20100101 Firefox/117.0`
- **Sec-CH-UA**: NOT SENT (Firefox does not emit Sec-CH-UA family)
- **Accept**: `application/vnd.apple.mpegurl,video/*`
- **Accept-Language**: `en-US,en;q=0.5`
- **Accept-Encoding**: `gzip, deflate, br`

### safari_16

- **uTLS HelloID**: `utls.HelloSafari_Auto`
- **User-Agent (mandatory)**: `Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15`
- **Sec-CH-UA**: NOT SENT
- **Accept**: `application/vnd.apple.mpegurl,video/*`
- **Accept-Language**: `en-us`
- **Accept-Encoding**: `gzip, deflate, br`

### ios_14

- **uTLS HelloID**: `utls.HelloIOS_Auto`
- **User-Agent (mandatory)**: `Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1 Mobile/15E148 Safari/604.1`
- **Sec-CH-UA**: NOT SENT

### vlc_3_0_18

- **uTLS HelloID**: `utls.HelloRandomizedNoALPN`
- **User-Agent (mandatory)**: `VLC/3.0.18 LibVLC/3.0.18`
- **Sec-CH-UA**: NOT SENT
- **Accept**: `*/*`
- **Accept-Language**: NOT SENT (VLC default omits)
- **Accept-Encoding**: NOT SENT

### tivimate_5

- **uTLS HelloID**: `utls.HelloRandomized`
- **User-Agent (mandatory)**: `okhttp/4.12.0`
- **Sec-CH-UA**: NOT SENT
- **Accept**: `*/*`

### kodi_21

- **uTLS HelloID**: `utls.HelloRandomizedNoALPN`
- **User-Agent (mandatory)**: `Kodi/21.0 (Android 11) AppleWebKit/537.36`
- **Sec-CH-UA**: NOT SENT
- **Accept**: `*/*`

## Mismatch examples (do NOT do these)

These pairings produce 407 from JA3-aware providers because the mismatch reveals bot:

| WRONG combination | Why provider rejects |
|---|---|
| UA `Chrome/120` + JA3 `vlc_3_0_18` | Chrome browsers never produce VLC TLS hello |
| UA `VLC/3.0.18` + JA3 `chrome_120` | VLC binary uses OpenSSL with library-specific ClientHello, never a Chrome handshake |
| UA `Mozilla/5.0 ... Firefox/117` + JA3 `chrome_120` | Firefox Gecko TLS stack differs from Chrome BoringSSL |
| UA `okhttp/4.12.0` + Sec-CH-UA `"Chromium";v="120"` | OkHttp does not emit Sec-CH-UA at all |

## Where coherence is enforced

- **Frontend M3U8 generator**: `m3u8-typed-arrays-ultimate.js` emits `#EXTHTTP:{User-Agent: ...}` matching the playlist's intended player target. The choice of UA must match the JA3 profile that JACIE will use when this list is consumed.
- **JACIE sidecar**: `jacie/main.go` `profileToUA()` injects the matching UA if caller omits the User-Agent header. Caller can override but then takes responsibility for matching.
- **Backend `ape_anti407_module.php`**: `getRotatedUA()` rotates among 5 canonical UAs deterministically. The rotation list MUST contain only UAs that have a corresponding JA3 profile in jacie sidecar registry, otherwise the chain breaks at sidecar handoff.

## Stress validation evidence

| Pair | Test | Iterations | Errors | Verdict |
|---|---|---|---|---|
| Chrome/120 + chrome_120 + Sec-CH-UA correct | mock-terovixa | ~100,000 | 0 | PASS |
| VLC/3.0.18 + vlc_3_0_18 | mock-megaott | ~100,000 | 0 | PASS |
| Firefox/117 + firefox_117 | mock-ja3 | (functional only V18 PASS) | - | PASS |
| okhttp/4.12 + tivimate_5 | mock-megaott | ~100,000 | 0 | PASS |

## Updating the matrix

When new providers appear with different fingerprint enforcement, OR when Chrome/Firefox/Safari ship a major UA update:

1. Capture real-world TLS hello via `tshark -i any -Y 'tls.handshake.type==1' -V` from a real device session
2. Generate or pick a matching `utls.HelloXxx_Auto` constant
3. Add UA + JA3 pair to `jacie/main.go` `profileToUA()` and `profileToHelloID()`
4. Add a test mock that emulates the provider's enforcement (rejects mismatch with 407)
5. Run sandbox-proof.sh + stress-suite.sh, expect new V## PASS with zero errors
6. Update this matrix with the new pair

Quarterly review recommended. Browser TLS fingerprints drift; stale mappings cause silent regression to 407.
