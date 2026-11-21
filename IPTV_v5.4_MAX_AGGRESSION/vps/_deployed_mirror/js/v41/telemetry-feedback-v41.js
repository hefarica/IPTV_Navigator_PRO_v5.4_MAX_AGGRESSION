
/**
 * 📊 Telemetry Feedback V4.1 (pasiva)
 * - Guarda decisiones por canal (hash) en localStorage
 * - Permite preferir último nivel aplicado cuando la confianza es LOW
 *
 * Global: window.TelemetryFeedbackV41
 */
(function(){
  const KEY = "v41_headers_telemetry_v1";
  const MAX = 5000;

  function stableHash(str){
    // hash simple (no criptográfico) para clave
    let h=2166136261;
    for (let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h>>>0).toString(16);
  }

  function load(){
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return {items:{}};
      const obj = JSON.parse(raw);
      if (!obj.items) obj.items = {};
      return obj;
    } catch (e) {
      return {items:{}};
    }
  }

  function save(db){
    try {
      // limitar tamaño
      const keys = Object.keys(db.items||{});
      if (keys.length > MAX) {
        // recorte simple: borrar los más antiguos por ts
        keys.sort((a,b)=>(db.items[a].ts||0)-(db.items[b].ts||0));
        const toDrop = keys.slice(0, keys.length - MAX);
        toDrop.forEach(k=>delete db.items[k]);
      }
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {}
  }

  function keyFor(meta){
    const s = `${meta.name||""}||${meta.url||""}`;
    return stableHash(s);
  }

  function record(meta, decision){
    const db = load();
    const k = keyFor(meta);
    db.items[k] = {
      ts: Date.now(),
      name: meta.name || "",
      url: meta.url || "",
      baseLevel: decision.baseLevel,
      recommendedLevel: decision.recommendedLevel,
      appliedLevel: decision.appliedLevel,
      confidence: decision.confidence,
      player: decision.player,
      removed: decision.removed || [],
    };
    save(db);
  }

  function getLast(meta){
    const db = load();
    const k = keyFor(meta);
    return db.items[k] || null;
  }

  function summarizeRecent(limit=200){
    const db = load();
    const items = Object.values(db.items||{});
    items.sort((a,b)=>(b.ts||0)-(a.ts||0));
    const slice = items.slice(0, limit);
    const dist = {1:0,2:0,3:0,4:0,5:0};
    let removedTotal = 0;
    slice.forEach(it=>{
      dist[it.appliedLevel] = (dist[it.appliedLevel]||0)+1;
      removedTotal += (it.removed||[]).length;
    });
    return {count: slice.length, dist, removedTotal};
  }

  window.TelemetryFeedbackV41 = {
    version: "4.1.0",
    recordDecision: record,
    getLastDecision: getLast,
    summarizeRecent
  };
})();
