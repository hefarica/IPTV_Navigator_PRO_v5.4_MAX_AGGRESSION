/**
 * 🚀 APE Resumable Uploader Server v1.3.0 - AUDIT-HARDENED
 * Protocolo: WeTransfer-Grade Pro + Unified Verification
 * Logic: Atomic Rename + Nginx-Proxy Friendly + API Verify
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const morgan = require('morgan');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 5002;
const UPLOAD_ROOT = path.join(__dirname, 'temp_uploads');
const FINAL_DIR = path.join(__dirname, 'final_lists');

// Ensure directories exist
fs.ensureDirSync(UPLOAD_ROOT);
fs.ensureDirSync(FINAL_DIR);

// 🛡️ Pro-Grade CORS for Infrastructure Resilience
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
        'Content-Type', 'Authorization', 'X-Session-Id', 'X-Chunk-Index',
        'X-Chunk-Hash', 'X-Toolkit-Version', 'X-Upload-Token', 'Content-Range',
        'X-File-Name', 'X-File-Size', 'X-Total-Chunks'
    ],
    exposedHeaders: ['Content-Length', 'X-Session-Id', 'X-Verify-Status', 'ETag', 'Content-Range'],
    maxAge: 86400
}));

app.use(morgan('dev'));

// Legacy Upload Setup (Directly to FINAL_DIR)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, FINAL_DIR),
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

/**
 * 🏥 HEALTH & CONNECTIVITY (Unified)
 */
const healthHandler = (req, res) => {
    res.json({
        status: 'ok',
        service: 'APE Uploader Service',
        version: '1.3.0-AUDIT-HARDENED',
        timestamp: new Date().toISOString()
    });
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);
app.get('/upload/health', healthHandler);
app.get('/api/upload/health', healthHandler);

/**
 * 📤 LEGACY UPLOAD (Single POST)
 */
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    console.log(`✅ [Legacy] Received: ${req.file.originalname}`);
    res.json({
        success: true, ok: true,
        public_url: `/lists/${req.file.originalname}`,
        status: 'ok'
    });
});

/**
 * 🔍 VERIFY ENDPOINT (Audit Requirement 6)
 * GET /api/upload/verify?filename=...
 */
app.get("/api/upload/verify", async (req, res) => {
    try {
        const filename = String(req.query.filename || "").trim();
        if (!filename) return res.status(400).json({ ok: false, exists: false, error: "filename_required" });

        const safeName = path.basename(filename);
        const fullPath = path.join(FINAL_DIR, safeName); // Use FINAL_DIR for verified files

        try {
            const stat = await fs.stat(fullPath);
            return res.json({
                ok: true,
                success: true,
                exists: true,
                size: stat.size,
                filename: safeName
            });
        } catch {
            return res.json({ ok: true, success: true, exists: false, filename: safeName });
        }
    } catch (error) {
        console.error("[VERIFY] Error:", error);
        return res.status(500).json({ ok: false, exists: false, error: "verify_failed" });
    }
});

/**
 * 🏁 RESUMABLE 1: INIT
 */
app.post('/api/upload/resumable/init', express.json(), async (req, res) => {
    const { filename, fileSize, totalChunks, fileHash } = req.body;
    if (!filename || !fileSize || !totalChunks) return res.status(400).json({ error: 'Missing metadata' });

    const sessionId = crypto.randomUUID();
    const sessionPath = path.join(UPLOAD_ROOT, sessionId);

    try {
        await fs.ensureDir(sessionPath);
        await fs.writeJson(path.join(sessionPath, 'metadata.json'), {
            filename, fileSize, totalChunks, fileHash,
            status: 'uploading',
            receivedChunks: [],
            startedAt: new Date().toISOString()
        });
        res.json({ success: true, sessionId });
    } catch (error) { res.status(500).json({ error: 'Init failed' }); }
});

/**
 * 📥 RESUMABLE 2: CHUNK
 */
app.post('/api/upload/resumable/chunk', express.raw({ limit: '20mb', type: '*/*' }), async (req, res) => {
    const sessionId = req.headers['x-session-id'];
    const chunkIndex = parseInt(req.headers['x-chunk-index']);
    const chunkHash = req.headers['x-chunk-hash'];

    const sessionPath = path.join(UPLOAD_ROOT, sessionId);
    if (!await fs.pathExists(sessionPath)) return res.status(404).json({ error: 'Session not found' });

    const chunkData = req.body;
    if (chunkHash && chunkHash !== crypto.createHash('sha256').update(chunkData).digest('hex')) {
        return res.status(400).json({ error: 'Integrity mismatch' });
    }

    try {
        await fs.writeFile(path.join(sessionPath, `chunk_${chunkIndex}`), chunkData);
        const metaPath = path.join(sessionPath, 'metadata.json');
        const metadata = await fs.readJson(metaPath);
        if (!metadata.receivedChunks.includes(chunkIndex)) {
            metadata.receivedChunks.push(chunkIndex);
            await fs.writeJson(metaPath, metadata);
        }
        res.json({ success: true, received: metadata.receivedChunks.length });
    } catch (e) { res.status(500).json({ error: 'Save failed' }); }
});

/**
 * 🔍 RESUMABLE 3: RESUMABLE STATUS/VERIFY
 */
app.get('/api/upload/resumable/verify/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const sessionPath = path.join(UPLOAD_ROOT, sessionId);
    if (!await fs.pathExists(sessionPath)) return res.status(404).json({ error: 'Session expired' });

    try {
        const metadata = await fs.readJson(path.join(sessionPath, 'metadata.json'));
        const isComplete = metadata.receivedChunks.length === metadata.totalChunks;
        res.json({
            success: true,
            status: isComplete ? 'ready' : 'incomplete',
            receivedChunks: metadata.receivedChunks,
            totalChunks: metadata.totalChunks
        });
    } catch (e) { res.status(500).json({ error: 'Resumable verify failed' }); }
});

/**
 * 🏗️ RESUMABLE 4: COMPLETE (Atomic Logic)
 */
app.post('/api/upload/resumable/complete', express.json(), async (req, res) => {
    const { sessionId } = req.body;
    const sessionPath = path.join(UPLOAD_ROOT, sessionId);
    if (!await fs.pathExists(sessionPath)) return res.status(404).json({ error: 'Session not found' });

    try {
        const metadata = await fs.readJson(path.join(sessionPath, 'metadata.json'));
        const finalPath = path.join(FINAL_DIR, metadata.filename);
        const tmpPath = `${finalPath}.tmp`;

        const writeStream = fs.createWriteStream(tmpPath);
        for (let i = 0; i < metadata.totalChunks; i++) {
            const data = await fs.readFile(path.join(sessionPath, `chunk_${i}`));
            writeStream.write(data);
        }
        writeStream.end();

        writeStream.on('finish', async () => {
            await fs.move(tmpPath, finalPath, { overwrite: true });
            console.log(`✅ [Atomic-Commit] ${metadata.filename}`);
            await fs.remove(sessionPath);
            res.json({ success: true, ok: true, public_url: `/lists/${metadata.filename}` });
        });
    } catch (error) {
        console.error('❌ Reconstruction failed:', error);
        res.status(500).json({ error: 'Storage error' });
    }
});

/**
 * 📂 STATIC ACCESS
 */
app.use('/lists', express.static(FINAL_DIR, {
    setHeaders: (res) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.set('Access-Control-Allow-Headers', '*');
    }
}));

app.listen(PORT, () => console.log(`✅ Indestructible Server v1.3.0 running on ${PORT}`));
