---
title: "AWS Serverless Backend (Phase 1)"
date: 2025-05-03T17:58:00+10:00
lastmod: 2026-06-23T10:47:00+10:00
weight: 20
---

## Architectural Decisions
1. Why Lambda and EventBridge?           
2. weather_processor vs weather_handler  
3. weather_analysis -- async Gemini       
4. Gemini API key via SSM                
5. S3 as cache layer, not DynamoDB       
6. API Gateway Custom Domain             
   (Cloudflare DNS + ACM, not raw endpoint)

## Lessons Learned
- Lambda 180s timeout
- CDK OOM crash di WSL
