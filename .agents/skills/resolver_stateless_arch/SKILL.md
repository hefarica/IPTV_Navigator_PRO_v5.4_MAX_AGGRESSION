---
description: MANDATORY rule — The resolver is STATELESS per-channel. It never manages lists, only individual channel requests. All context travels in the URL.
---

# Skill: Resolver Stateless Architecture (INVIOLABLE)

> 🚨 **The resolver does NOT manage lists. It manages INDIVIDUAL CHANNELS.**
> Every channel carries its FULL context in the URL. The resolver never needs to know which list a channel belongs to.

---

## RULE 1 — STATELESS PER REQUEST

Each channel request is **fully self-contained**:

```
?ch=401 &srv=B64(host|user|pass) &p=P1 &ctx=B64({rs,br,bf,nc,hd,cs,cp})
   │          │                      │         │
   │          │                      │         └─ QoS snapshot from PM
   │          │                      └─ Profile assigned by Classifier
   │          └─ Server credentials
   └─ Channel ID
```

- The resolver does **NOT** store which list the channel came from
- The resolver does **NOT** need to fetch or parse the parent list
- EVERYTHING needed is in the URL parameters

---

## RULE 2 — MULTIPLE LISTS = MULTIPLE INDIVIDUAL REQUESTS

```
Lista A: ESPN(ch=401,p=P1), Fox(ch=55,p=P2)
Lista B: CineMax(ch=890,p=P0), Discovery(ch=122,p=P3)
Lista C: HBO(ch=200,p=P1), TNT(ch=310,p=P2)

Player opens ESPN → resolver sees ?ch=401&p=P1&ctx=...
Player opens CineMax → resolver sees ?ch=890&p=P0&ctx=...
   ↑ resolver does NOT know these are from different lists
```

The resolver processes each channel independently:
1. Decode `ctx` → get REAL QoS values
2. Read `X-APE-*` headers from request
3. CTX Overlay → override anti-cut profile with list values
4. Emit 3 synced layers (VLCOPT + KODIPROP + EXTHTTP)
5. Register in session registry

---

## RULE 3 — SESSION REGISTRY (MAX 10 CONCURRENT)

**File**: `sessions/active_sessions.json`

| Field | Purpose |
|-------|---------|
| Key | `IP:channelId` — unique per device + channel |
| Profile | `P0-P5` from the channel's list |
| QoS data | Full reference: bitrate, buffer, health, risk, headroom |
| Timestamp | Last access time |

**Auto-eviction**: sessions older than 5 minutes are removed.
**Max 10**: if a new request exceeds 10, the oldest session is evicted (FIFO).

Query active sessions: `?action=sessions`

---

## RULE 4 — WHY THIS WORKS WITH ANY NUMBER OF LISTS

| Scenario | How resolver handles it |
|----------|----------------------|
| 1 list, 1 channel playing | 1 session in registry |
| 1 list, 5 channels playing | 5 sessions, each with its own profile |
| 3 lists, 3 channels playing | 3 sessions — resolver doesn't know they're from 3 lists |
| 10 lists, 10 channels | 10 sessions max — auto-evicts oldest if exceeded |
| 50 lists generated, 2 playing | Only 2 sessions — unused channels don't consume resources |

---

## RULE 5 — WHAT I MUST NEVER DO

1. ❌ Try to "load a list" into the resolver
2. ❌ Store list metadata or list filenames in the resolver
3. ❌ Create per-list state or per-list sessions
4. ❌ Assume a channel belongs to a specific list
5. ❌ Open parallel connections to "pre-resolve" channels from a list (anti-509)
6. ❌ Exceed 10 concurrent sessions
