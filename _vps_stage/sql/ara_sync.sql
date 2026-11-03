-- ARA-X `/sync` · esquema SQLite mínimo (t35)
--
-- Se aplica en /var/lib/ara-x/sync.db (0600) antes de habilitar `/sync`.
-- El PHP también ejecuta `CREATE TABLE IF NOT EXISTS` en el primer request;
-- este archivo es la migración reproducible para el deploy y para auditoría.
--
-- `ara_sync_keys` es METADATA de rotación/auditoría (key_id ↔ device_ids), NO
-- guarda secretos: el secreto vive en /etc/ara-x/sync-keys.json (0600, fuera
-- del webroot y del repo). Así el hash/DB nunca expone la clave HMAC.

PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 3000;

CREATE TABLE IF NOT EXISTS ara_sync_state (
    device_id TEXT PRIMARY KEY,
    last_seq INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ara_sync_nonce (
    device_id TEXT NOT NULL,
    nonce_hash TEXT NOT NULL,
    seq INTEGER NOT NULL,
    body_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (device_id, nonce_hash)
);

CREATE TABLE IF NOT EXISTS ara_sync_replay (
    device_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    body_hash TEXT NOT NULL,
    resp_raw TEXT NOT NULL,
    resp_sig TEXT NOT NULL,
    resp_etag TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (device_id, seq)
);

CREATE TABLE IF NOT EXISTS ara_sync_keys (
    key_id TEXT PRIMARY KEY,
    device_ids_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    retires_at INTEGER,
    note TEXT
);

CREATE INDEX IF NOT EXISTS idx_ara_sync_nonce_created ON ara_sync_nonce (created_at);
CREATE INDEX IF NOT EXISTS idx_ara_sync_replay_created ON ara_sync_replay (created_at);
CREATE INDEX IF NOT EXISTS idx_ara_sync_keys_retires ON ara_sync_keys (retires_at);
