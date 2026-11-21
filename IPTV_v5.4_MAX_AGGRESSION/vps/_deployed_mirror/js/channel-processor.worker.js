/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔧 APE CHANNEL PROCESSOR WORKER v1.0
 * ═══════════════════════════════════════════════════════════════════════════
 * Procesa canales en background sin bloquear UI
 */

let channelBatches = [];
let totalProcessed = 0;
let totalExpected = 0;

self.addEventListener('message', async (e) => {
    const { action, channels, batchIndex, total } = e.data;

    if (action === 'start') {
        totalExpected = total;
        channelBatches = [];
        totalProcessed = 0;
    }
    else if (action === 'process') {
        const processed = processChannelBatch(channels);
        channelBatches[batchIndex] = processed;
        totalProcessed += processed.length;

        self.postMessage({
            type: 'progress',
            processed: totalProcessed,
            total: totalExpected
        });
    }
    else if (action === 'finalize') {
        // Unificar y ordenar (si vienen desordenados los batches)
        // channelBatches es un array disperso, .flat() lo une bien si los índices son correctos
        const allChannels = channelBatches.flat();

        self.postMessage({
            type: 'complete',
            processedChannels: allChannels
        });

        // Limpieza
        channelBatches = [];
        totalProcessed = 0;
    }
});

function processChannelBatch(channels) {
    return channels.map(channel => {
        // Simulación de heurísticas pesadas que antes bloqueaban la UI
        // En una implementación completa, pasaríamos la lógica de heuristics aquí.
        // Por ahora, hacemos el parsing básico y limpieza.

        return {
            ...channel,
            _processed: true,
            // Pre-calcular perfiles si es posible
            _apeProfile: determineAPEProfile(channel),
            _processedAt: Date.now()
        };
    });
}

function determineAPEProfile(channel) {
    // Lógica simplificada de perfilado para aliviar al thread principal
    const name = (channel.name || '').toUpperCase();
    const group = (channel.group || '').toUpperCase();
    const url = (channel.url || '');

    if (name.includes('4K') || group.includes('4K')) return 'P1';
    if (name.includes('FHD') || name.includes('1080')) return 'P3';
    if (name.includes('HD') || name.includes('720')) return 'P4';
    if (name.includes('SD')) return 'P5';

    return 'P2'; // Default
}
