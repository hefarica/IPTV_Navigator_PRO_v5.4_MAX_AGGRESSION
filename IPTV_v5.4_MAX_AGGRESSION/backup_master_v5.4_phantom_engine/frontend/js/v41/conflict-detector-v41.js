
/**
 * 🧽 Conflict Detector V4.1
 * - Elimina headers con baja compatibilidad por reproductor
 * - Evita combinaciones "overkill" en players delicados
 *
 * Global: window.ConflictDetectorV41
 */
(function(){
  const ALWAYS_REMOVE = new Set([
    "Proxy-Connection",
  ]);

  const PLAYER_REMOVALS = {
    "perfect-player": new Set([
      "Sec-Fetch-Dest","Sec-Fetch-Mode","Sec-Fetch-Site","Sec-Fetch-User",
      "Sec-CH-UA","Sec-CH-UA-Mobile","Sec-CH-UA-Platform",
      "TE","Upgrade","Connection",
      "X-Playback-Session-Id","X-Player-Session-Id",
    ]),
    "smarters": new Set([
      "Sec-Fetch-Dest","Sec-Fetch-Mode","Sec-Fetch-Site","Sec-Fetch-User",
      "Sec-CH-UA","Sec-CH-UA-Mobile","Sec-CH-UA-Platform",
      "TE","Upgrade",
    ]),
    "kodi": new Set([
      "Sec-CH-UA","Sec-CH-UA-Mobile","Sec-CH-UA-Platform",
      "Sec-Fetch-Dest","Sec-Fetch-Mode","Sec-Fetch-Site","Sec-Fetch-User",
    ]),
    "ott": new Set([
      // OTT suele tolerar casi todo; removemos solo lo que suele sobrar
      "Proxy-Connection",
    ]),
    "vlc": new Set([
      "Proxy-Connection",
    ]),
    "tivimate": new Set([
      "Sec-CH-UA","Sec-CH-UA-Mobile","Sec-CH-UA-Platform",
    ]),
    "generic": new Set([])
  };

  function sanitize(headers, ctx){
    const player = (ctx && ctx.targetPlayer) ? String(ctx.targetPlayer).toLowerCase() : "generic";
    const removed = [];
    const notes = [];
    const toRemove = new Set([...(PLAYER_REMOVALS[player]||PLAYER_REMOVALS.generic), ...ALWAYS_REMOVE]);

    const out = {};
    Object.keys(headers||{}).forEach(k=>{
      if (toRemove.has(k)) {
        removed.push(k);
        return;
      }
      const v = headers[k];
      if (v === null || v === undefined) return;
      const vs = String(v).trim();
      if (!vs) return;
      out[k] = vs;
    });

    if (removed.length) notes.push(`Sanitizado para player="${player}"`);
    return { headers: out, removed, notes, player };
  }

  window.ConflictDetectorV41 = {
    version: "4.1.0",
    sanitizeHeaders: sanitize
  };
})();
