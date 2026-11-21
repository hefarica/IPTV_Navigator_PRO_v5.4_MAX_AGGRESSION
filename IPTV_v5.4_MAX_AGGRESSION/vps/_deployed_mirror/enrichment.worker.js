// enrichment.worker.js (V4.20.2 - V5.0 compatible)
// Worker industrial para procesamiento masivo de canales sin bloquear UI.

let isCancelled = false;

self.onmessage = async (event) => {
  try {
    const msg = event.data || {};
    if (!msg || !msg.type) return;

    if (msg.type === 'ping' || msg.type === 'heartbeat') {
      self.postMessage({ type: 'pong', ts: Date.now() });
      return;
    }

    if (msg.type === 'cancel') {
      isCancelled = true;
      self.postMessage({ type: 'cancelled_ack', ts: Date.now() });
      return;
    }

    if (msg.type === 'enrich' || msg.type === 'enrich_quality') {
      isCancelled = false;
      const channels = Array.isArray(msg.channels) ? msg.channels : [];
      const total = channels.length;

      self.postMessage({ type: 'heartbeat', status: 'Iniciando procesamiento...' });

      // Enriquecimiento liviano: marca campo interno si no existe.
      for (let i = 0; i < total; i++) {
        // 🛑 Verificar cancelación proactiva
        if (isCancelled) {
          self.postMessage({ type: 'done', enriched: i, status: 'Cancelado por usuario' });
          return;
        }

        const ch = channels[i];
        if (ch && typeof ch === 'object') {
          if (ch.__enriched !== true) ch.__enriched = true;
          if (!ch.qualityTag && ch.quality) ch.qualityTag = ch.quality;
        }

        // Notificar progreso cada X registros para no saturar el bus
        if (i % 500 === 0 || i === total - 1) {
          self.postMessage({
            type: 'progress',
            progress: i / total,
            enriched: i,
            total,
            batches: Math.floor(i / 500),
            ts: Date.now()
          });
        }
      }

      self.postMessage({
        type: 'done',
        channels,
        enriched: total,
        ts: Date.now(),
        source: msg.source?.id || 'worker'
      });
      return;
    }

    // Default: echo
    self.postMessage({ type: 'unknown', received: msg.type, ts: Date.now() });
  } catch (e) {
    self.postMessage({ type: 'worker_error', message: String(e), ts: Date.now() });
  }
};
