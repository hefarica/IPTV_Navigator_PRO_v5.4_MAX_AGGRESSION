<?php
// APE Device Registry — run once to initialize DB
$db = new SQLite3("/var/www/html/prisma/db/ape_devices.db");
$db->exec("CREATE TABLE IF NOT EXISTS ape_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  device_ip TEXT,
  player TEXT,
  platform TEXT,
  android_version TEXT,
  model TEXT,
  settings_applied INTEGER DEFAULT 0,
  chisel_port INTEGER,
  vps_tunnel TEXT,
  user_agent TEXT,
  registered_at TEXT,
  last_seen TEXT,
  notes TEXT
)");
$db->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_device_id ON ape_devices(device_id)");
$db->exec("CREATE TABLE IF NOT EXISTS ape_providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  host TEXT NOT NULL,
  port INTEGER,
  protocol TEXT,
  last_status INTEGER,
  redirect_chain TEXT,
  registered_at TEXT,
  last_seen TEXT
)");
$db->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_host ON ape_providers(host, port)");
chmod("/var/www/html/prisma/db/ape_devices.db", 0664);
echo "DB_OK\n";
