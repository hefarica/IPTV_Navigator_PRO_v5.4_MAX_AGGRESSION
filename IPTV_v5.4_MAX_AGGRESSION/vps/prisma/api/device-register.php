<?php
// APE Device Registry — POST endpoint
// POST /prisma/api/device-register.php
// Body: JSON { device_id, device_ip, player, platform, android_version, model, settings_applied, chisel_port, notes }
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") { http_response_code(204); exit; }
if ($_SERVER["REQUEST_METHOD"] !== "POST") { http_response_code(405); echo json_encode(["error"=>"method"]); exit; }

$raw = file_get_contents("php://input");
$data = json_decode($raw, true);
if (!$data || empty($data["device_id"])) {
    http_response_code(400);
    echo json_encode(["error"=>"missing device_id"]);
    exit;
}

try {
    $db = new SQLite3("/var/www/html/prisma/db/ape_devices.db");
    $now = gmdate("Y-m-d H:i:s");
    $stmt = $db->prepare("INSERT INTO ape_devices
        (device_id, device_ip, player, platform, android_version, model, settings_applied, chisel_port, vps_tunnel, user_agent, registered_at, last_seen, notes)
        VALUES
        (:device_id,:device_ip,:player,:platform,:android_version,:model,:settings_applied,:chisel_port,:vps_tunnel,:user_agent,:now,:now,:notes)
        ON CONFLICT(device_id) DO UPDATE SET
          device_ip=excluded.device_ip, player=excluded.player,
          settings_applied=excluded.settings_applied, chisel_port=excluded.chisel_port,
          vps_tunnel=excluded.vps_tunnel, last_seen=excluded.last_seen, notes=excluded.notes");
    $stmt->bindValue(":device_id", $data["device_id"] ?? "");
    $stmt->bindValue(":device_ip", $data["device_ip"] ?? "");
    $stmt->bindValue(":player", $data["player"] ?? "");
    $stmt->bindValue(":platform", $data["platform"] ?? "android");
    $stmt->bindValue(":android_version", $data["android_version"] ?? "");
    $stmt->bindValue(":model", $data["model"] ?? "");
    $stmt->bindValue(":settings_applied", intval($data["settings_applied"] ?? 0), SQLITE3_INTEGER);
    $stmt->bindValue(":chisel_port", intval($data["chisel_port"] ?? 0), SQLITE3_INTEGER);
    $stmt->bindValue(":vps_tunnel", $data["vps_tunnel"] ?? "");
    $stmt->bindValue(":user_agent", $_SERVER["HTTP_USER_AGENT"] ?? "");
    $stmt->bindValue(":now", $now);
    $stmt->bindValue(":notes", $data["notes"] ?? "");
    $stmt->execute();
    echo json_encode(["ok"=>true,"device_id"=>$data["device_id"],"registered_at"=>$now]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error"=>$e->getMessage()]);
}
