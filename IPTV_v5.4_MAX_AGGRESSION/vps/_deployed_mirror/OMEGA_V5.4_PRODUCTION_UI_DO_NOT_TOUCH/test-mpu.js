
// ============================================================================
// TEST SCRIPT FOR R2 MULTIPART UPLOAD
// ============================================================================
// Usage: node test-mpu.js [optional-fake-size-in-mb]
// Example: node test-mpu.js 15
// Note: This requires a node environment with 'fetch' (Node 18+).

const WORKER_URL = 'https://ape-redirect-api-m3u8-native.beticosa1.workers.dev';
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB for testing (Worker limit is high, but we simulate chunks)
const TARGET_SIZE_MB = process.argv[2] ? parseInt(process.argv[2]) : 12; // Default 12MB to force multipart if threshold was low, or just to test flow

// Mock File class for Node.js
class MockFile {
    constructor(buffer, name) {
        this.buffer = buffer;
        this.name = name;
        this.size = buffer.length;
    }
    slice(start, end) {
        return this.buffer.subarray(start, end);
    }
}

async function createFakeFile(sizeMB) {
    console.log(`Creating fake ${sizeMB}MB file...`);
    const size = sizeMB * 1024 * 1024;
    const buffer = Buffer.alloc(size);
    // Fill with some data
    for (let i = 0; i < size; i += 1024) {
        buffer.write('TEST_DATA_', i, 'utf8');
    }
    return new MockFile(buffer, `test_mpu_${Date.now()}.m3u8`);
}

async function testMPU() {
    const file = await createFakeFile(TARGET_SIZE_MB);
    console.log(`Test File: ${file.name} (${file.size} bytes)`);

    try {
        // 1. Create Upload
        console.log('\n[1] Creating Upload Session...');
        const createRes = await fetch(`${WORKER_URL}/upload/mpu/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: file.name,
                metadata: { source: 'test-script' }
            })
        });

        if (!createRes.ok) throw new Error(await createRes.text());
        const session = await createRes.json();
        console.log('Session Created:', session);

        const uploadId = session.uploadId;
        const key = session.key;
        const parts = [];

        // 2. Upload Parts
        console.log('\n[2] Uploading Parts...');
        let offset = 0;
        let partNum = 1;

        while (offset < file.size) {
            const end = Math.min(offset + CHUNK_SIZE, file.size);
            const chunk = file.slice(offset, end);
            console.log(`   Uploading Part ${partNum} (${chunk.length} bytes)...`);

            const partRes = await fetch(`${WORKER_URL}/upload/mpu/part?key=${encodeURIComponent(key)}&uploadId=${uploadId}&partNumber=${partNum}`, {
                method: 'PUT',
                body: chunk // Send raw buffer
            });

            if (!partRes.ok) throw new Error(await partRes.text());
            const partInfo = await partRes.json();
            console.log(`   Part ${partNum} Done. ETag: ${partInfo.etag}`);

            parts.push({ partNumber: partNum, etag: partInfo.etag });
            offset += CHUNK_SIZE;
            partNum++;
        }

        // 3. Complete Upload
        console.log('\n[3] Completing Upload...');
        const completeRes = await fetch(`${WORKER_URL}/upload/mpu/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key,
                uploadId,
                parts
            })
        });

        if (!completeRes.ok) throw new Error(await completeRes.text());
        const result = await completeRes.json();
        console.log('SUCCESS! Result:', result);
        console.log(`Public URL: ${result.public_url}`);

    } catch (error) {
        console.error('TEST FAILED:', error);
    }
}

testMPU();
