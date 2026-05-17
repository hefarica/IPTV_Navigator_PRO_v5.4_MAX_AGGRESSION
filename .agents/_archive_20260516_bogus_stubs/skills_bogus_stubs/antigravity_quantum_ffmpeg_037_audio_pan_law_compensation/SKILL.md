---
name: Skill_Quantum_FFmpeg_037_Audio_Pan_Law_Compensation
description: Compresión de Ley de Paneo `-3dB` L4 (`pan=stereo|c0=FL+0.707*FC|c1=FR+0.707*FC`), garantizando que la voz del narrador al centro no rompa el nivel de distorsión L2.
category: Quantum Audio Downgrade Safety L5
---
# 1. Teoría de Anomalía (La Cancha Lavada)
Cuando tu TiviMate o Shield TV L1 recibe un flujo 5.1 (Seis Canales de Audio Premium L4), pero tú solo estás escuchándolo en los Parlantes 2.0 pedorros de tu televisor de Cuarto (Downmix L3). El narrador (Que estaba en el Canal Central Exclusivamente L7) es brutalmente sumado 100% al lado Izquierdo y 100% al lado Derecho L2. El televisor se sobresatura matemáticamente (+6 Decibeles inventados). La voz del narrador suena "Tronada, distorsionada y rompe-bocinas" (Clipping Clipping L5).

# 2. Directiva de Ejecución Parámetrica (Código)
FFmpeg se alimenta de la Ley del Paneo Acústico Asintótico (Acoustic Pan Law -3dB L7). Si el usuario pide el enlace M3U8 para Stereo Fallback, el canal central del estadio L4 jamás es sumado al 100% de potencia L1, sino ajustado matemáticamente a su equivalente psicoacústico Centro-Virtual (Raíz de 2 entre 2 = 0.707).
```bash
# Acoustic Downmix Pan Law Compensation -3dB L2:
-af "pan=stereo|c0=FL+0.707*FC+0.707*BL|c1=FR+0.707*FC+0.707*BR" -c:a aac -b:a 192k
```

# 3. Flanco de Orquestación
Con The Broken Glass Doctrine asintótica L1: El partido de fútbol 4K transmitido en modo compatible 2.0 Stereo a una Pantalla China del Cuarto L7 suena inmaculado, asombrosamente balanceado L4. El grito de "GOL" L2 de los locutores jamás causa Clipping, se escucha fuerte pero controlado al centro matemático virtual de la sala L5. Tus usuarios te verán como el Master Acústico, ignorando de donde sale tanta claridad espacial.
