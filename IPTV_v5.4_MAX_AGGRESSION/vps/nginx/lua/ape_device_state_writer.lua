-- ape_device_state_writer.lua — log_by_lua en /omega/open.
-- Captura device->canal desde el $remote_addr REAL (nginx lo ve; el Python :45732 solo ve 127.0.0.1).
-- Autopista: fase log, jamas bloquea, jamas toca el 302.
local args = ngx.req.get_uri_args()
local ip = ngx.var.remote_addr
if not ip or ip == "" then return end
local ch = args.channel_id; if not ch then return end
local safe = ip:gsub("[^0-9A-Fa-f:.]", "_")
-- Archivo PLANO en /dev/shm (tmpfs 0777 → www-data escribe directo; sin subdir, sin bootstrap, reboot-safe).
local path = "/dev/shm/ape_devstate_" .. safe .. ".json"
local tmp  = path .. ".tmp" .. ngx.worker.pid()
local rec = string.format(
  '{"channel_id":%q,"content_type":%q,"codec_hint":%q,"resolution_hint":%q,"ts":%d,"ip":%q}',
  tostring(ch), tostring(args.content_type or ""), tostring(args.codec_hint or ""),
  tostring(args.resolution_hint or ""), ngx.time(), ip)
local f = io.open(tmp, "w")
if f then f:write(rec); f:close(); os.rename(tmp, path) end
