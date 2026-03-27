# APE Resilience Toolkit v6.3 — Deployment Package

## 📦 Contents

```
APE_Resilience_Toolkit_v6.3/
├── 📄 README.md                          ← You are here
├── 🔧 install.sh                         ← One-click installer
├── 📋 docs/
│   ├── SOP_Standard_Operating_Procedures.md
│   ├── MANUAL_Funciones.md
│   ├── MANUAL_Usuario.md
│   └── MANUAL_Implementacion.md
├── 🚀 engine/
│   ├── resolve_quality.php               ← Entry point (profiles P0-P5)
│   └── cmaf_engine/
│       ├── resilience_integration_shim.php  ← 5-motor pipeline
│       └── modules/
│           ├── neuro_buffer_controller.php  ← Motor 1: Adaptive buffer
│           ├── modem_priority_manager.php   ← Motor 3: DSCP + Network
│           └── ai_super_resolution_engine.php ← Motor 4: Visual Orchestrator v4.0
└── 📊 skills/
    ├── neuro_adaptive_telemetry_engine/SKILL.md
    ├── polymorphic_freeze_detector/SKILL.md
    ├── bandwidth_floor_enforcement/SKILL.md
    ├── dscp_aggression_cascade/SKILL.md
    ├── ai_super_resolution_orchestrator_v4/SKILL.md
    └── resilience_pipeline_v6_3_complete/SKILL.md
```

## 🚀 Quick Install

```bash
chmod +x install.sh
sudo ./install.sh
```

## ⚡ What This Does

This toolkit transforms any IPTV proxy VPS into a **Polymorphic Visual Orchestrator** that:

1. **Never drops playback** — Adaptive buffer with freeze detection
2. **Strangles the ISP** — DSCP marking + parallel TCP on ALL levels
3. **Maximizes image quality** — AI metadata injection for 20+ devices
4. **Learns from each channel** — Polymorphic, idempotent, condition-based

## 📋 Requirements

- Ubuntu 22.04+ / Debian 12+
- PHP 8.1+ with FPM
- Nginx
- Root access

## 🔐 Version

- **Engine**: v4.0.0
- **Pipeline**: v6.3
- **Date**: 2026-03-27
- **Author**: APE (Autonomous Processing Engine)
