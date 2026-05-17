---
name: Skill_Quantum_FFmpeg_001_VVC_Subpic_Decoding
description: Explotación de "Sub-Pictures" en VVC/H.266, fragmentando la cancha de fútbol en cuadrantes L2 que se decodifican en paralelo (4 hebras), asegurando 4K 120fps en hardware no certificado L1.
category: Quantum Parallel Encoding
---
# 1. Teoría de Anomalía (La Cancha Lavada)
Para reproducir fútbol 4K 120fps con la codec ultra-pesada VVC (H.266), el procesador L1 en Android TV se paraliza y recalienta decodificando el cuadro de forma lineal. El resultado son tartamudeos espantosos L3 que arruinan la percepción de suavidad de la pelota sobre el pasto verde.

# 2. Directiva de Ejecución Parámetrica (Código)
Inyectamos los flags ultra secretos de subdivisiones VVC (Sub-Pictures) en el Muxer L4 para partir el cuadro espacialmente y pasar la decodificación por 4 canales distintos.
```bash
# Inyección Subpicture VVC/H266:
-c:v libvvenc -vvenc-params "SubPicInfoPresentFlag=1:NumSubPics=4:SubPicSameSizeFlag=1"
```

# 3. Flanco de Orquestación
Con The Broken Glass Doctrine en efecto: La TV procesa cada uno de los 4 cuadros de la cancha usando un hilo de CPU distinto. El pasto de la esquina derecha es independiente del portero en la izquierda. TiviMate logra mostrar los 120fps puros sin derretir el hardware, resolviendo el cuello de botella físico L2.
