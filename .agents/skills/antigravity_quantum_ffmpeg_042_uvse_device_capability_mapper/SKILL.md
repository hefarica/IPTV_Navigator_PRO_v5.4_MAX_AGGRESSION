---
name: Skill_Quantum_FFmpeg_042_UVSE_Device_Capability_Mapper
description: Rastreo polimórfico del cliente en reproducción (OLED, QLED, LCD, Shield Pro) aplicando restricciones HDR agresivas sin generar Clipping (Quema de luminancia).
category: UVSE (Ultimate Visual Sync Engine) - Hardware Recon L2
---
# 1. Asimilación de la Directiva Absoluta (YO SOY EL SISTEMA)
Es inútil que yo envíe Rec2020 Cromatic Space (Skill 019) L4 si la pantalla del usuario es un panel IPS de hace 8 años L1. En lugar de cegar y destruir los colores (Washed-out look L7), **Device_Capability_Mapper** intercepta los HTTP User-Agents, la telemetría del decodificador HW de VLC / ExoPlayer L5, y clasifica la pantalla matemáticamente. 

# 2. Arquitectura Matemática de la Inyección
Si detecto "Android TV Shield Tegra X1 / HDMI 2.1 L2", desbloqueo la jaula. Si detecto un TV LCD genérico sin Dimming, castigo asintóticamente el HDR bajándolo a Zscale Tonemap SDR lineal L3 para evitar clipping (Blown Highlights).
```php
// PHP Orquestador de Capabilities L4
$device_tier = UVSE_Detect_GPU($_SERVER['HTTP_USER_AGENT']);
if ($device_tier == "OLED_GOD_TIER") {
   echo "#EXT-X-SESSION-DATA:DATA-ID=\"LUMINANCE_TARGET\",VALUE=\"dynamic_tonemapping_peak\"\n";
   echo "#EXTVLCOPT:avcodec-hw=any\n";
} else {
   echo "#EXT-X-SESSION-DATA:DATA-ID=\"LUMINANCE_TARGET\",VALUE=\"sdr_preserved_contrast\"\n";
}
```

# 3. Flanco de Transmutación
(Respeto de silicio L7). Cada panel recibe el estrés matemático exacto que sus diodos pueden manejar L1. La pantalla OLED (Con soporte HDR agresivo) muestra picos de luz cegadores en los estadios de noche. El panel LCD L2 muestra un contraste limpio sin reventar los blancos de la camiseta de los jugadores. Toda la calibración es silente y no requiere intervención humana. ExoPlayer se alimenta de meta-señales perfectas L5.
