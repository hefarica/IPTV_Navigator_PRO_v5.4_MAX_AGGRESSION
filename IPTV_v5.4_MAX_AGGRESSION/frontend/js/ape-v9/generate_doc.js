const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer, 
        AlignmentType, HeadingLevel, BorderStyle, WidthType, TableOfContents, PageBreak,
        ShadingType, VerticalAlign, PageNumber, LevelFormat } = require('docx');
const fs = require('fs');

// Color palette - Midnight Code for tech document
const colors = {
  primary: "020617",
  bodyText: "1E293B",
  secondary: "64748B",
  accent: "94A3B8",
  tableBg: "F8FAFC"
};

const tableBorder = { style: BorderStyle.SINGLE, size: 12, color: colors.secondary };
const cellBorders = { top: tableBorder, bottom: tableBorder, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } };

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Times New Roman", size: 22 } } },
    paragraphStyles: [
      { id: "Title", name: "Title", basedOn: "Normal",
        run: { size: 56, bold: true, color: colors.primary, font: "Times New Roman" },
        paragraph: { spacing: { before: 240, after: 120 }, alignment: AlignmentType.CENTER } },
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, color: colors.primary, font: "Times New Roman" },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, color: colors.bodyText, font: "Times New Roman" },
        paragraph: { spacing: { before: 300, after: 150 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, color: colors.secondary, font: "Times New Roman" },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } }
    ]
  },
  numbering: {
    config: [
      { reference: "bullet-main", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "num-diagnostic", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "num-principles", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "num-codec", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "num-hdr", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "num-transport", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "num-backend", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "num-player", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "num-decoder", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "num-limitations", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }
    ]
  },
  sections: [
    // COVER PAGE
    {
      properties: { page: { margin: { top: 0, right: 0, bottom: 0, left: 0 } } },
      children: [
        new Paragraph({ spacing: { before: 6000 }, children: [] }),
        new Paragraph({ 
          alignment: AlignmentType.CENTER,
          spacing: { before: 2000, after: 400 },
          children: [new TextRun({ text: "IPTV Support Cortex", size: 72, bold: true, color: colors.primary, font: "Times New Roman" })]
        }),
        new Paragraph({ 
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "Quality Resolution Engine", size: 44, color: colors.secondary, font: "Times New Roman" })]
        }),
        new Paragraph({ 
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
          children: [new TextRun({ text: "Arquitectura de Producción para Streaming OTT", size: 28, color: colors.bodyText, font: "Times New Roman" })]
        }),
        new Paragraph({ 
          alignment: AlignmentType.CENTER,
          spacing: { before: 4000, after: 200 },
          children: [new TextRun({ text: "resolve_quality.php  |  channels_map.json", size: 24, color: colors.accent, font: "Times New Roman" })]
        }),
        new Paragraph({ 
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 },
          children: [new TextRun({ text: "Versión 1.0.0  |  2026", size: 22, color: colors.secondary, font: "Times New Roman" })]
        })
      ]
    },
    // TABLE OF CONTENTS
    {
      properties: { page: { margin: { top: 1800, right: 1440, bottom: 1440, left: 1440 } } },
      headers: {
        default: new Header({ children: [new Paragraph({ 
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: "IPTV Support Cortex - Architecture Document", size: 18, color: colors.secondary, font: "Times New Roman" })]
        })] })
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ 
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Page ", size: 18, font: "Times New Roman" }), new TextRun({ children: [PageNumber.CURRENT], size: 18 }), new TextRun({ text: " of ", size: 18 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18 })]
        })] })
      },
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Table of Contents")] }),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
        new Paragraph({ 
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 },
          children: [new TextRun({ text: "Note: Right-click the Table of Contents and select \"Update Field\" to refresh page numbers.", size: 18, color: "999999", italics: true, font: "Times New Roman" })]
        }),
        new Paragraph({ children: [new PageBreak()] }),
        
        // SECTION 1: DIAGNOSTICO TECNICO
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("1. Diagnóstico Técnico")] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "El sistema IPTV Support Cortex aborda problemáticas críticas en la resolución de calidad para streaming OTT que los sistemas tradicionales no manejan adecuadamente. Los problemas fundamentales que debe resolver la arquitectura propuesta incluyen la falta de determinismo en las decisiones de calidad, la inconsistencia entre manifest y player, y la incapacidad de adaptarse a diferentes fuentes sin hardcoding específico.", size: 22, font: "Times New Roman" })] }),
        
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("1.1 Problemas Críticos Identificados")] }),
        new Paragraph({ numbering: { reference: "num-diagnostic", level: 0 }, children: [new TextRun({ text: "Fragmentación de directivas: Las listas M3U8 modernas incluyen múltiples fuentes de directivas (EXTVLCOPT, KODIPROP, EXTHTTP, EXTATTRFROMURL) que frecuentemente entran en conflicto, generando comportamiento impredecible en los reproductores.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-diagnostic", level: 0 }, children: [new TextRun({ text: "Detección insuficiente de capacidades: Los sistemas existentes frecuentemente asumen capacidades de codec, HDR o transporte sin verificar el soporte real del dispositivo decodificador, resultando en errores de reproducción o degradación silenciosa.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-diagnostic", level: 0 }, children: [new TextRun({ text: "Selección de variante subóptima: Sin un motor de decisión determinista, la selección de variantes ABR se basa en heurísticas vagas en lugar de jerarquía técnica explícita, priorizando resolución sobre bitrate estable.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-diagnostic", level: 0 }, children: [new TextRun({ text: "Inconsistencia transporte-manifest: La desalineación entre el formato declarado en el manifest y el formato real de los segmentos causa fallos silenciosos y artefactos de reproducción.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-diagnostic", level: 0 }, children: [new TextRun({ text: "Gestión HDR incorrecta: Muchos sistemas activan HDR sin verificar soporte del dispositivo o realizan tone-mapping sin preservar la intención artística del contenido.", size: 22, font: "Times New Roman" })] }),
        
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("1.2 Objetivos del Sistema")] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "El IPTV Support Cortex está diseñado para maximizar la calidad visual perceptual dentro de los límites físicos reales del stream fuente y hardware disponible. Esto se logra mediante un motor de decisión determinista que prioriza compatibilidad real, integridad del stream, estabilidad de reproducción, y calidad perceptual, en ese orden jerárquico específico.", size: 22, font: "Times New Roman" })] }),
        
        // SECTION 2: DISEÑO DE ARQUITECTURA
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("2. Diseño de Arquitectura")] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "La arquitectura del IPTV Support Cortex se fundamenta en arrays normalizados que garantizan idempotencia, bidireccionalidad y adaptabilidad universal. El diseño separa responsabilidades en capas discretas que procesan información de manera determinista, produciendo siempre la misma salida para las mismas entradas.", size: 22, font: "Times New Roman" })] }),
        
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("2.1 Principios Arquitectónicos Fundamentales")] }),
        new Paragraph({ numbering: { reference: "num-principles", level: 0 }, children: [new TextRun({ text: "Idempotencia: El procesamiento del mismo canal/lista múltiples veces produce exactamente la misma estructura de decisión. Las directivas equivalentes se deduplican y las redundancias se eliminan automáticamente.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-principles", level: 0 }, children: [new TextRun({ text: "Bidireccionalidad: resolve_quality.php puede leer channels_map.json, enriquecerlo con datos inferidos del manifest, y devolver overrides calculados. El mapa sirve como base declarativa de políticas, no como dump estático.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-principles", level: 0 }, children: [new TextRun({ text: "Adaptabilidad universal: La arquitectura soporta listas con cualquier combinación de transporte (TS, CMAF, fMP4, DASH), URLs con query params, tags propietarias, y decoraciones agresivas de EXTVLCOPT/KODIPROP/EXTHTTP.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-principles", level: 0 }, children: [new TextRun({ text: "Separación por capas: Cada tipo de información se aísla en su propio array estructurado, permitiendo análisis independiente y modificación sin efectos colaterales en otras capas.", size: 22, font: "Times New Roman" })] }),
        
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("2.2 Modelo de Arrays Normalizados")] }),
        
        // Table: Array Layers
        new Table({
          columnWidths: [2800, 6560],
          margins: { top: 100, bottom: 100, left: 180, right: 180 },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                new TableCell({ borders: cellBorders, width: { size: 2800, type: WidthType.DXA }, shading: { fill: colors.tableBg, type: ShadingType.CLEAR }, verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Capa", bold: true, size: 22, font: "Times New Roman" })] })] }),
                new TableCell({ borders: cellBorders, width: { size: 6560, type: WidthType.DXA }, shading: { fill: colors.tableBg, type: ShadingType.CLEAR }, verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Responsabilidad", bold: true, size: 22, font: "Times New Roman" })] })] })
              ]
            }),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 2800, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "manifest_facts", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6560, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Datos extraídos del M3U8: tags, variantes, directivas, formato detectado", size: 20, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 2800, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "transport_facts", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6560, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Análisis de transporte: TS, CMAF, fMP4, DASH, LL-HLS, encriptación", size: 20, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 2800, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "codec_facts", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6560, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Códecs disponibles, perfiles, niveles, soporte HDR, LCEVC", size: 20, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 2800, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "video_pipeline_facts", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6560, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Resoluciones, framerates, bitrates, interlace, ABR ladder", size: 20, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 2800, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "device_profile", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6560, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Capacidades del dispositivo: codecs, HDR, resolución máxima, bitrate", size: 20, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 2800, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "network_profile", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6560, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Estado de red: bandwidth, latencia, jitter, pérdida de paquetes", size: 20, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 2800, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "quality_decision", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6560, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Decisión final: variante, codec, resolución, HDR, ABR, deinterlace", size: 20, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 2800, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "resolved_output", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6560, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Salida estructurada para el player: headers, opciones, fallbacks", size: 20, font: "Times New Roman" })] })] })
            ]})
          ]
        }),
        new Paragraph({ spacing: { before: 100, after: 300 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Table 1: Capas de arrays normalizados", size: 18, italics: true, color: colors.secondary, font: "Times New Roman" })] }),
        
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("2.3 Flujo Bidireccional")] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "El flujo de datos entre resolve_quality.php y channels_map.json sigue un patrón de enriquecimiento progresivo. El motor lee políticas base del mapa, las cruza con facts extraídos del manifest, aplica overrides de device/network, y actualiza el mapa con datos aprendidos. Este ciclo permite que el sistema mejore sus decisiones con cada resolución sin perder idempotencia.", size: 22, font: "Times New Roman" })] }),
        
        // SECTION 3: ARBOL DE DECISION
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("3. Árbol de Decisión Formal")] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "El motor de decisión sigue una jerarquía técnica explícita donde cada nivel evalúa condiciones específicas antes de proceder al siguiente. Las decisiones nunca se basan en heurísticas vagas sino en reglas deterministas derivadas de las capacidades reales del sistema.", size: 22, font: "Times New Roman" })] }),
        
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.1 Selección de Codec")] }),
        new Paragraph({ numbering: { reference: "num-codec", level: 0 }, children: [new TextRun({ text: "Evaluar soporte de HEVC en dispositivo: si device_profile.codec_support.hevc.decode = true Y profile compatible, seleccionar HEVC como codec primario.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-codec", level: 0 }, children: [new TextRun({ text: "Si HEVC no disponible, evaluar AV1: verificar soporte de AV1 en dispositivo Y pipeline compatible (no todos los dispositivos con AV1 soportan todos los perfiles).", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-codec", level: 0 }, children: [new TextRun({ text: "Si AV1 no disponible, fallback a AVC: siempre disponible como codec universal, verificar máximo perfil soportado.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-codec", level: 0 }, children: [new TextRun({ text: "LCEVC solo como enhancement: si device.lcevc_support = true Y stream contiene base compatible, activar capa de mejora. LCEVC nunca es codec base independiente.", size: 22, font: "Times New Roman" })] }),
        
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.2 Selección de Transporte")] }),
        new Paragraph({ numbering: { reference: "num-transport", level: 0 }, children: [new TextRun({ text: "Detectar formato real del manifest: analizar #EXT-X-MAP, extensión de segmentos, y estructura para determinar TS, CMAF, o DASH.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-transport", level: 0 }, children: [new TextRun({ text: "Validar coherencia: si manifest declara CMAF pero segmentos son TS, generar warning y fallback a TS.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-transport", level: 0 }, children: [new TextRun({ text: "Cruzar con player_profile: si player no soporta CMAF (ej: algunos browsers), forzar TS o rechazar stream.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-transport", level: 0 }, children: [new TextRun({ text: "Evaluar LL-HLS: si server_control indica low-latency, configurar parámetros específicos para minimizar live delay.", size: 22, font: "Times New Roman" })] }),
        
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.3 Manejo de HDR")] }),
        new Paragraph({ numbering: { reference: "num-hdr", level: 0 }, children: [new TextRun({ text: "Detectar HDR en stream: analizar VIDEO-RANGE tag y codec parameters para identificar HDR10, HDR10+, Dolby Vision, o HLG.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-hdr", level: 0 }, children: [new TextRun({ text: "Verificar soporte de dispositivo: cruzar tipo HDR detectado con device.hdr_support para determinar si passthrough es posible.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-hdr", level: 0 }, children: [new TextRun({ text: "Si HDR soportado: activar passthrough, mantener metadata dinámica (SMPTE 2094-40 para HDR10+, DMIF para Dolby Vision).", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-hdr", level: 0 }, children: [new TextRun({ text: "Si HDR no soportado: aplicar tone-mapping con método apropiado (hable para HDR10, reinhard para HDR10+, mobius para Dolby Vision). Nunca prometer HDR si el dispositivo no lo soporta.", size: 22, font: "Times New Roman" })] }),
        
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.4 Configuración ABR")] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "El sistema ABR se configura dinámicamente basándose en el estado de red reportado. Si network.bandwidth_variance > 0.2, el algoritmo switcha de throughput-based a buffer-based para mayor estabilidad. El target bitrate se calcula como network.stable_bandwidth * 0.8 (safety margin), nunca excediendo device.max_bitrate ni stream.max_bitrate.", size: 22, font: "Times New Roman" })] }),
        
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.5 Deinterlace")] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "La detección de interlace se realiza mediante análisis de codec parameters y patrones de FPS (25i, 29.97i, 50i, 59.94i). Si interlace detectado, el modo preferido es bwdif (mejor calidad/performance ratio). El sistema nunca promete 120 FPS si la fuente no lo es - la interpolación de frames se marca como externa/opcional.", size: 22, font: "Times New Roman" })] }),
        
        // SECTION 4: INTEGRACION FFMPEG
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("4. Reglas de Integración con FFmpeg/HLS/CMAF")] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "La conexión entre el motor de decisión y el backend de transcodificación/empaquetado requiere sincronización cuidadosa entre las decisiones de resolve_quality.php y los parámetros aplicados en FFmpeg.", size: 22, font: "Times New Roman" })] }),
        
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.1 HLS TS Legacy")] }),
        new Paragraph({ numbering: { reference: "num-backend", level: 0 }, children: [new TextRun({ text: "FFmpeg flags: -hls_time 6 -hls_list_size 0 -hls_flags independent_segments", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-backend", level: 0 }, children: [new TextRun({ text: "Codec flags HEVC: -c:v libx265 -preset slow -crf 20 -profile:v main", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-backend", level: 0 }, children: [new TextRun({ text: "Deblocking en encoder: -x265-params deblock=-1:-1 habilita loop filter óptimo", size: 22, font: "Times New Roman" })] }),
        
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.2 HLS fMP4/CMAF")] }),
        new Paragraph({ numbering: { reference: "num-backend", level: 0 }, children: [new TextRun({ text: "FFmpeg flags: -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 -hls_time 4", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-backend", level: 0 }, children: [new TextRun({ text: "LL-HLS: -hls_flags split_by_time -hls_playlist_type event", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-backend", level: 0 }, children: [new TextRun({ text: "HDR10 metadata: -x265-params hdr-opt=1:repeat-headers=1:max-cll=\"1000,400\":master-display=\"G(...\"", size: 22, font: "Times New Roman" })] }),
        
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.3 LCEVC Integration")] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "LCEVC requiere pipeline específico que el backend debe preparar. Las flags lcevc_tune=vq, dc_dithering_strength, y m_hf_strength son políticas de codificación del enhancement layer, no del base. El backend debe generar el stream base (AVC o HEVC) más los enhancement layers en formato MPEG-5 Part 2 LCEVC. El player debe implementar LCEVC DIL o SDK nativo.", size: 22, font: "Times New Roman" })] }),
        
        // SECTION 5: LIMITACIONES
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("5. Limitaciones Físicas y de Implementación")] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "Es fundamental establecer límites claros entre lo que el backend puede decidir, lo que el player puede ejecutar, y lo que el decodificador hardware soporta. No todas las mejoras pueden forzarse desde el manifest o desde JavaScript.", size: 22, font: "Times New Roman" })] }),
        
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("5.1 Lo que el Backend SÍ Puede Decidir")] }),
        new Paragraph({ numbering: { reference: "num-backend", level: 0 }, children: [new TextRun({ text: "Selección de variante ABR basada en bitrate y capacidades declaradas del dispositivo.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-backend", level: 0 }, children: [new TextRun({ text: "Normalización y deduplicación de directivas del manifest.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-backend", level: 0 }, children: [new TextRun({ text: "Configuración de headers HTTP para requests del stream.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-backend", level: 0 }, children: [new TextRun({ text: "Recomendación de codec, transporte, y modo HDR basado en capacidades.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-backend", level: 0 }, children: [new TextRun({ text: "Preparación de metadatos para enhancement layers (LCEVC).", size: 22, font: "Times New Roman" })] }),
        
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("5.2 Lo que el Player Decide")] }),
        new Paragraph({ numbering: { reference: "num-player", level: 0 }, children: [new TextRun({ text: "Aplicación real del algoritmo ABR basado en condiciones de red dinámicas.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-player", level: 0 }, children: [new TextRun({ text: "Selección de variante en tiempo real durante playback.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-player", level: 0 }, children: [new TextRun({ text: "Gestión de buffer y latencia de live.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-player", level: 0 }, children: [new TextRun({ text: "Aplicación de deinterlace si el contenido es interlaced.", size: 22, font: "Times New Roman" })] }),
        
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("5.3 Lo que el Decodificador Decide")] }),
        new Paragraph({ numbering: { reference: "num-decoder", level: 0 }, children: [new TextRun({ text: "Aplicación de deblocking y loop filtering interno del codec.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-decoder", level: 0 }, children: [new TextRun({ text: "Conversión de color space y tone mapping HDR a SDR si es necesario.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-decoder", level: 0 }, children: [new TextRun({ text: "Aplicación de CDEF (Constrained Directional Enhancement Filter) en AV1 - esto es interno al decodificador, no inyectable desde JS.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-decoder", level: 0 }, children: [new TextRun({ text: "Film grain synthesis en AV1 si está habilitado en el bitstream.", size: 22, font: "Times New Roman" })] }),
        
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("5.4 Lo que NO Puede Forzarse")] }),
        new Paragraph({ numbering: { reference: "num-limitations", level: 0 }, children: [new TextRun({ text: "4K/120 FPS no puede inventarse si no existe en la fuente. La interpolación de frames es post-procesamiento opcional, no parte del manifest.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-limitations", level: 0 }, children: [new TextRun({ text: "CDEF no se \"inyecta\" desde JavaScript - es una herramienta interna del decodificador AV1 que se aplica automáticamente.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-limitations", level: 0 }, children: [new TextRun({ text: "HDR no puede activarse si el dispositivo no lo soporta - tone mapping es el fallback correcto.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-limitations", level: 0 }, children: [new TextRun({ text: "LCEVC no puede funcionar sin decoder compatible - el backend puede preparar metadatos pero el player debe tener DIL/SDK.", size: 22, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "num-limitations", level: 0 }, children: [new TextRun({ text: "Noise reduction y deblocking strength son políticas de codificación/transcodificación, no controles del player.", size: 22, font: "Times New Roman" })] }),
        
        // SECTION 6: EJEMPLO DE SALIDA
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("6. Ejemplo de Salida JSON")] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "La siguiente estructura representa una salida típica del motor resolve_quality.php después de procesar un manifest HLS con múltiples variantes:", size: 22, font: "Times New Roman" })] }),
        
        new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "{", size: 18, font: "Courier New" })] }),
        new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: '  "status": "success",', size: 18, font: "Courier New" })] }),
        new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: '  "selected_variant": {', size: 18, font: "Courier New" })] }),
        new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: '    "url": "https://example.com/stream_8m.m3u8",', size: 18, font: "Courier New" })] }),
        new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: '    "bandwidth": 8000000', size: 18, font: "Courier New" })] }),
        new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: '  },', size: 18, font: "Courier New" })] }),
        new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: '  "selected_codec": { "codec": "hevc", "profile": "main", "level": 4.1 },', size: 18, font: "Courier New" })] }),
        new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: '  "render_resolution": { "width": 1920, "height": 1080, "label": "FHD" },', size: 18, font: "Courier New" })] }),
        new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: '  "deinterlace_mode": { "required": false, "mode": null },', size: 18, font: "Courier New" })] }),
        new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: '  "hdr_mode": { "mode": "sdr", "passthrough": false, "tone_mapping": null },', size: 18, font: "Courier New" })] }),
        new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: '  "transport_mode": { "mode": "cmaf", "segment_type": "fmp4" },', size: 18, font: "Courier New" })] }),
        new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: '  "abr_state": { "enabled": true, "algorithm": "throughput" },', size: 18, font: "Courier New" })] }),
        new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: '  "quality_score": { "score": 82, "grade": "A" },', size: 18, font: "Courier New" })] }),
        new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: '  "why": { "summary": "Selected HEVC at 1080p..." }', size: 18, font: "Courier New" })] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "}", size: 18, font: "Courier New" })] })
      ]
    }
  ]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/home/z/my-project/download/IPTV_Support_Cortex_Architecture_BusinessProfessional_2026-03-20.docx", buffer);
  console.log("Document created successfully!");
});
