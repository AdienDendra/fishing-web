---
title: "Fase 1: Data Ingestion Engine"
description: "Dokumentasi pipeline penarikan data maritim dari Bureau of Meteorology (BOM)."
date: 2026-05-29T22:00:00+10:00
lastmod: 2026-05-30T10:15:00+10:00
draft: false
weight: 10
---

### Arsitektur Data Ingestion

Sistem ini menggunakan skrip Python yang dikemas untuk menarik data cuaca maritim mentah secara berkala dari API BOM. 

Data yang berhasil ditarik kemudian akan diparsing sebelum dilempar ke dalam pipeline arsitektur cloud untuk diolah lebih lanjut.