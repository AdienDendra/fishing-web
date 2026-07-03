---
title: "Frontend, API Gateway, Cloudflare Pages, and Public Delivery (Phase 2)"
date: 2025-05-29T17:58:00+10:00
lastmod: 2026-07-03T17:47:00+10:00
weight: 30

---
## 1. Goal
Explain how the AWS backend is exposed as a public-facing weather dashboard.

## 2. Frontend Architecture
Hugo static site, Cloudflare Pages, Cloudflare DNS/CDN, AWS API Gateway backend.

## 3. Runtime Data Flow
Browser → Cloudflare Pages → weather-fetch.js → api.fishing.adiendendra.com → API Gateway → Lambda.

## 4. Hugo Project Structure
Explain content, layouts, partials, static/js, static/data, data-pipeline.

## 5. Weather Dashboard Design
Safety status, graph system, location selector, fish activity, sunrise/sunset, AI analysis.

## 6. API Integration Contract
Endpoint, query params, response assumptions, partial analysis state, error handling. 

## 7. Reusable Graph Components
SVG graph blueprint, danger threshold, series ID convention, centralized styles.

## 8. Deployment Workflow
GitHub → Cloudflare Pages → Hugo build → production deployment.

## 9. DNS, TLS, and CDN
Separate frontend and API domains; Cloudflare and API Gateway custom domain boundary.

## 10. Security and IAM Boundary
No AWS credentials in browser; no frontend secrets; backend IAM remains behind API.

## 11. Reliability and Failure Handling
API failure, stale data, partial Gemini processing, safe fallback states.

## 12. Operations Runbook
How to deploy, rollback, smoke test, debug API failure, and verify production.

## 13. Lessons Learned
What was difficult: Hugo partials, responsive SVG, cache refresh, browser hard reload, API async state.

## 14. Future Improvements
Security headers, CSP, Cloudflare Web Analytics, automated smoke tests, frontend CI checks.
bla bla bla

