---
title: "Fase 2: Data Ingestion Engine"
description: "Dokumentasi pipeline penarikan data maritim dari Bureau of Meteorology (BOM)."
date: 2025-05-29
draft: false
weight: 10
---

### Arsitektur Data Ingestion

Sistem ini menggunakan skrip Python yang dikemas untuk menarik data cuaca maritim mentah secara berkala dari API BOM. 

Data yang berhasil ditarik kemudian akan diparsing sebelum dilempar ke dalam pipeline arsitektur cloud untuk diolah lebih lanjut.