---
name: hlsjs-internals-crypto-aes-eme
description: Use when debugging encrypted HLS playback (KEY_LOAD_ERROR, decrypt failures, sample-AES, Widevine/PlayReady DRM init), choosing between Web Crypto vs software AES, or diagnosing why CDM negotiation fails. Covers Decrypter, AESCrypto, AESDecryptor, FastAESKey, SampleAesDecrypter, EMEController.
---

# hls.js Internals — Crypto (AES-128, Sample-AES, EME/DRM)

Source: `class/src/crypt/*.js` · `class/src/controller/eme-controller.js` · `class/src/demux/sample-aes.js`

## Overview

hls.js handles 3 encryption regimes:

1. **AES-128 full segment** (`#EXT-X-KEY:METHOD=AES-128`) — entire fragment encrypted CBC. Decrypt before demux.
2. **Sample-AES** (`#EXT-X-KEY:METHOD=SAMPLE-AES`) — only audio samples / video NAL slices encrypted (Apple format). Decrypt during demux.
3. **EME / Widevine / PlayReady** (`#EXT-X-KEY:METHOD=ISO-23001-7` or external) — browser CDM via Encrypted Media Extensions. Decrypt in CDM.

Per-method decision tree picks Web Crypto API (browser-native AES) → fallback to software AES → fallback to EME for DRM.

## When to Use

- "Encrypted HLS plays in Safari but not Chrome" → Web Crypto vs software path issue
- "DRM stream loads manifest but no media" → EMEController flow (license server, init data)
- "Player decrypts then segment doesn't demux" → padding/IV problem
- Implementing custom license XHR (`licenseXhrSetup`)
- Reading SampleAesDecrypter for ATSC-3 / Apple FairPlay-adjacent formats

## Decrypter — Reference

`class/src/crypt/decrypter.js`. Front-facing API; routes to Web Crypto or software path.

### Methods
| Method | Signature | Purpose |
|---|---|---|
| `decrypt(data, key, iv, callback)` | `(Uint8Array, ArrayBuffer, ArrayBuffer, fn) → void` | Async decrypt entry point |
| `isSync()` | `() → boolean` | True if current path is synchronous (software) |
| `onWebCryptoError(...)` | `(...)` | Fallback handler — disables `disableWebCrypto`, retries via software |
| `destroy()` | `() → void` | Cleanup |

### Properties
| Property | Purpose |
|---|---|
| `key` | Current key bytes |
| `fastAesKey` | Cached `FastAESKey` instance for software path |
| `decryptor` | Active decryption engine (AESCrypto for Web Crypto, AESDecryptor for software) |
| `disableWebCrypto` | Set to true after `onWebCryptoError` to permanently use software |
| `removePKCS7Padding` | Whether to strip PKCS#7 padding after decrypt (default true for AES-128 segments) |

### Decision Path
```
decrypt() →
  if !disableWebCrypto && crypto.subtle exists:
    AESCrypto.decrypt() (Web Crypto API, GPU-accelerated when available)
    on error → onWebCryptoError → disableWebCrypto = true
  else:
    AESDecryptor.decrypt() (pure JS, CPU only, slower)
```

## AESCrypto — Reference

Wrapper around `crypto.subtle.decrypt({name: 'AES-CBC', iv}, key, data)`. Native browser performance.

### Methods
- `decrypt(data, iv) → Promise<ArrayBuffer>` — Web Crypto AES-CBC

## AESDecryptor — Reference

Pure-JS software AES-128 implementation. Used as Web Crypto fallback.

### Methods
| Method | Purpose |
|---|---|
| `expandKey(key)` | Run AES key schedule. Builds `keySchedule_` (10 round keys for AES-128) and `invKeySchedule_` |
| `decrypt(inputBuffer, offset, ivBuffer, removePKCS7Padding)` | Main decrypt: CBC mode, 16-byte blocks, optional padding strip |
| `initTable()` | Initialize S-boxes, mix-columns lookup tables (precomputed) |
| `decryptBlock(...)` | Single 16-byte block decrypt |
| `uint8ArrayToUint32Array_(input)` | Convert byte buffer to 32-bit word array |
| `networkToHostOrderSwap(word)` | Endian swap |
| `destroy()` | Cleanup |

### Internal Tables
- S-boxes (`SBOX`, `INV_SBOX`)
- Round constant `rcon` array
- Mix-columns lookups
- Forward + inverse key schedules

## FastAESKey

Helper to pre-compute and cache AES round keys. Reused across consecutive segments using same KEY URI (KeyLoader caches the URI; FastAESKey caches the schedule).

### Methods
- `expandKey() → Promise<CryptoKey>` — Web Crypto key import
- (or sync key schedule for software path)

## SampleAesDecrypter

`class/src/demux/sample-aes.js`. Handles Apple sample-AES (only audio samples / NAL slices encrypted).

### Methods
- `decryptBuffer(encryptedData) → ArrayBuffer` — decrypt single sample buffer
- `decryptAacSample(samples, sampleIndex)` — decrypt AAC frame
- `decryptAvcSample(samples, sampleIndex)` — decrypt H.264 NAL slice
- `decryptAvcSamples(samples)` — batch

### Why It Exists
TS-AES (full segment) preserves segment integrity but breaks parallel decrypt-and-demux. Sample-AES enables streaming demux while only sensitive samples are encrypted.

## EMEController — DRM Reference

`class/src/controller/eme-controller.js`. Coordinates browser EME for Widevine/PlayReady.

### Lifecycle
```
manifest parsed
  → check #EXT-X-KEY METHOD for ISO-23001-7 / KEYFORMAT for DRM scheme
  → _attemptKeySystemAccess()
       requestMediaKeySystemAccess(systemId, configs)
  → _onMediaKeySystemAccessObtained()
       MediaKeySystemAccess.createMediaKeys()
  → _onMediaKeysCreated()
       media.setMediaKeys(mediaKeys)
       Listen for 'encrypted' event on <video>
  → on 'encrypted'
       MediaKeys.createSession()
       generateRequest(initDataType, initData)
  → on session 'message'
       _requestLicense(message)
       XHR to licenseServerUrl → response
       session.update(response)
  → playback proceeds, CDM decrypts
```

### Properties
| Property | Purpose |
|---|---|
| `_isMediaEncrypted` | Detected encrypted media flag |
| `_emeEnabled` | Config gate (`emeEnabled: true` required) |
| `_media` | Reference to `<video>` |
| `_mediaKeySessions` | Active sessions |
| `_licenseRequestFailureCount` | Retry counter |
| `_initData` | initData buffers from each `encrypted` event |

### Methods
| Method | Purpose |
|---|---|
| `_attemptKeySystemAccess()` | Calls `requestMediaKeySystemAccess(...)` per `widevineLicenseUrl` config |
| `_onMediaKeySystemAccessObtained()` | Create MediaKeys, attach to media |
| `_onMediaKeysCreated()` | Listen for `'encrypted'` event |
| `_requestLicense()` | XHR to license server (override via `licenseXhrSetup`) |
| `getLicenseServerUrl()` | Resolve license URL from config |

### Config Keys
| Key | Default | Purpose |
|---|---|---|
| `emeEnabled` | `false` | Master switch — must be `true` to enable EME flow |
| `widevineLicenseUrl` | `undefined` | License server URL for Widevine |
| `requestMediaKeySystemAccessFunc` | (auto-detect) | Override for system access (e.g., FairPlay polyfill) |
| `licenseXhrSetup` | (none) | Customize license XHR (auth headers, payload wrapping) |

## Free Function

- `removePadding(data: Uint8Array) → Uint8Array` — strip PKCS#7 padding after AES-128 decrypt

## Common Bugs

| Symptom | Diagnosis |
|---|---|
| `Decrypter.decrypt` callback never fires | Web Crypto error not caught; check console for `OperationError`. Set `disableWebCrypto: true` to force software |
| Software path 50× slower than Web Crypto | Expected — pure-JS AES is CPU-bound. Don't use software path on phones |
| `KEY_LOAD_ERROR` on every key | KEY URI is HTTP not HTTPS while page is HTTPS (mixed content blocked). Or auth headers missing |
| EME stays in `_attemptKeySystemAccess` forever | Browser doesn't expose Widevine for the codec set (e.g. HEVC + Widevine on Firefox). Check `MediaKeySystemAccess.getConfiguration()` |
| Sample-AES breaks audio sync | `SampleAesDecrypter.decryptAacSample` IV calculation issue — IV must be derived per-sample from segment-level IV + sample number |

## Toolkit Application

For our IPTV Navigator (Xtream, no DRM):
- Most lists are **clear** — Decrypter never invoked
- A few HD providers add AES-128 segment encryption — verify Web Crypto path works on TiviMate/Kodi (TiviMate uses ExoPlayer's own crypto, NOT hls.js)
- We do NOT use EME — `emeEnabled: false` is correct in our config

## Cross-references

- **hlsjs-internals-fragment-lifecycle** — Fragment.decryptdata feeds Decrypter
- **hlsjs-internals-demuxers-remuxers** — TSDemuxer.decryptAndRemux entry point
- **skill_hls_fmp4_encryption_cbcs** — alternate encryption regime (CBCS for fMP4)
- **iptv-exthttp-traps-checklist** — KEY URI in EXTHTTP must follow same rules
