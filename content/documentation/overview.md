---
title: "Overview"
date: 2025-05-29T17:58:00+10:00
weight: 10
---

### Background
Cerita keresahan, statistik korban rock fishing NSW, masalah data cuaca yang tersebar tetapi tidak actionable, kenapa angler butuh satu tool live yang simpel.

### Solution Architecture
Gambaran besar sistem, diagram E2E, kenapa serverless bukan VPS, kenapa Cloudflare, migration dari wa-mancing-gateway ke AWS native stack.

### Cost Analysis
Hugo & Cloudflare (subdomain dari adiendendra.com)
Trade-off VPS vs serverless (angka konkret) →
Lambda + Eventbridge free tier vs EC2 hourly → 
AWS SSM vs .env
NAT Gateway $42/bulan yang dihindari →
S3 cache layer vs other konvensional sever
Estimasi biaya aktual project di skala portfolio