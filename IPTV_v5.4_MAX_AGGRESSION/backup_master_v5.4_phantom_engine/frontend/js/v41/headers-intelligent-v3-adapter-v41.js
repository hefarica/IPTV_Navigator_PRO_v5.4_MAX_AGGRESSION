
/**
 * 🧠 Headers Intelligent V3.x (V4.1 Adapter)
 * - Heurística ligera (5 factores) para recomendar nivel 1..5
 * - Diseñado para operar con ultra-headers-matrix.js (getAllHeadersForLevel)
 *
 * Global: window.HeadersIntelligentV41
 */
(function(){
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function scoreResolution(meta){
    const name = (meta.name||"").toLowerCase();
    const url  = (meta.url||"").toLowerCase();
    if (/(^|[^a-z])8k([^a-z]|$)/.test(name) || url.includes("7680x4320")) return 5;
    if (name.includes("4k") || name.includes("uhd") || url.includes("3840x2160") || url.includes("2160")) return 5;
    if (name.includes("1080") || name.includes("fhd") || url.includes("1920x1080")) return 4;
    if (name.includes("720")  || name.includes("hd")  || url.includes("1280x720")) return 3;
    if (name.includes("480")  || name.includes("sd")) return 2;
    return 1;
  }

  function scoreDRM(meta){
    const url = (meta.url||"").toLowerCase();
    const name = (meta.name||"").toLowerCase();
    if (url.includes("widevine") || url.includes("playready") || url.includes("drm") || name.includes("drm")) return 5;
    if (url.includes("token") || url.includes("auth") || url.includes("signature") || url.includes("jwt")) return 4;
    if (url.includes("key") || url.includes("encrypted") || url.includes("aes")) return 3;
    return 1;
  }

  function scoreCodec(meta){
    const name = (meta.name||"").toLowerCase();
    const url  = (meta.url||"").toLowerCase();
    // Solo señales suaves; no hacemos parsing pesado
    if (name.includes("av1")) return 4;
    if (name.includes("hevc") || name.includes("h.265") || name.includes("x265") || url.includes("hevc")) return 4;
    if (name.includes("vp9")) return 3;
    return 2;
  }

  function scoreContentType(meta){
    const group = (meta.group||"").toLowerCase();
    const name = (meta.name||"").toLowerCase();
    if (group.includes("sports") || group.includes("deport") || name.includes("ppv")) return 4;
    if (group.includes("premium") || group.includes("vip")) return 5;
    if (group.includes("movies") || group.includes("pelicul") || group.includes("series")) return 3;
    return 2;
  }

  function scoreProvider(meta){
    const url = (meta.url||"").toLowerCase();
    const advanced = ["akamai","cloudflare","fastly","cloudfront","edgekey","edgesuite"];
    if (advanced.some(p => url.includes(p))) return 5;
    const standard = ["cdn","stream","video"];
    if (standard.some(p => url.includes(p))) return 3;
    return 2;
  }

  function calcConfidence(scores){
    const vals = Object.values(scores);
    const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
    const variance = vals.reduce((s,v)=>s+Math.pow(v-mean,2),0)/vals.length;
    if (variance < 0.6) return "HIGH";
    if (variance < 1.6) return "MEDIUM";
    return "LOW";
  }

  function reasoning(scores){
    const r=[];
    if (scores.resolution>=4) r.push("alta resolución");
    if (scores.drm>=4) r.push("auth/DRM");
    if (scores.codec>=4) r.push("codec exigente");
    if (scores.contentType>=4) r.push("contenido premium/sports");
    if (scores.provider>=4) r.push("CDN exigente");
    return r.length?("Señales: "+r.join(", ")):"Análisis estándar";
  }

  const api = {
    version: "3.0.0-adapter-v41",
    analyzeChannel(meta){
      const scores = {
        resolution: scoreResolution(meta),
        drm: scoreDRM(meta),
        codec: scoreCodec(meta),
        contentType: scoreContentType(meta),
        provider: scoreProvider(meta),
      };
      const avg = Object.values(scores).reduce((a,b)=>a+b,0)/5;
      const level = clamp(Math.round(avg), 1, 5);
      return {
        level,
        scores,
        confidence: calcConfidence(scores),
        reasoning: reasoning(scores),
      };
    }
  };

  window.HeadersIntelligentV41 = api;
})();
