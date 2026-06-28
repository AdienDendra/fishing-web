/**
 * weather-fetch.js
 * Handles API fetch, DOM updates, and SVG graph rendering
 * for fishing.adiendendra.com
 *
 * SVG ID convention (matches weather-graph-blueprint.html):
 *   Path:  {series}-{graphId}-path   e.g. wave-height-path, swell-period-path
 *   Dots:  {series}-{graphId}-dots   e.g. wave-height-dots, tide-height-dots
 *   SVG:   telemetry-svg-{graphId}   e.g. telemetry-svg-height
 */

(function () {
    'use strict';

    const API_BASE = 'https://api.fishing.adiendendra.com/weather';
    const SVG_NS   = 'http://www.w3.org/2000/svg';

    // SVG coordinate constants (matches viewBox="0 0 900 410")
    const SVG_X_START = 80;
    const SVG_X_END   = 820;
    const SVG_Y_TOP   = 40;
    const SVG_Y_BOT   = 360;

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function el(id) { return document.getElementById(id); }
    function setText(id, val) { const e = el(id); if (e) e.textContent = val; }

    function resolveLocation() {
        const inputEl = document.getElementById('location-input');
        if (inputEl && inputEl.dataset.lat && inputEl.dataset.lng) {
            return {
                lat:  parseFloat(inputEl.dataset.lat),
                lon:  parseFloat(inputEl.dataset.lng),
                name: inputEl.textContent.trim()
            };
        }
        // Fallback default
        return { lat: -34.0049, lon: 151.2288, name: 'The Leap, Kurnell' };
    }

    // ─── SVG math ─────────────────────────────────────────────────────────────

    function toY(value, min, max) {
        const clamped = Math.max(min, Math.min(max, value ?? 0));
        const ratio   = (clamped - min) / (max - min || 1);
        return SVG_Y_BOT - ratio * (SVG_Y_BOT - SVG_Y_TOP);
    }

    function toX(hour) {
        return SVG_X_START + (hour / 24) * (SVG_X_END - SVG_X_START);
    }

        function buildPath(values, min, max) {
        const ext = [...values.slice(0, 24), values[23] ?? 0];
        const pts = ext.map((v, i) => ({
            x: parseFloat(toX(i).toFixed(1)),
            y: parseFloat(toY(v, min, max).toFixed(1))
        }));
        const tension = 0.5;
        let d = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = i > 0 ? pts[i-1] : pts[i];
            const p1 = pts[i], p2 = pts[i+1];
            const p3 = i < pts.length-2 ? pts[i+2] : pts[i+1];
            const cp1x = Math.max(SVG_X_START, Math.min(SVG_X_END, p1.x + (p2.x-p0.x)*tension/3));
            const cp1y = Math.max(SVG_Y_TOP,   Math.min(SVG_Y_BOT, p1.y + (p2.y-p0.y)*tension/3));
            const cp2x = Math.max(SVG_X_START, Math.min(SVG_X_END, p2.x - (p3.x-p1.x)*tension/3));
            const cp2y = Math.max(SVG_Y_TOP,   Math.min(SVG_Y_BOT, p2.y - (p3.y-p1.y)*tension/3));
            d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x} ${p2.y}`;
        }
        return d;
    }

    // ─── Core render function ─────────────────────────────────────────────────

    /**
     * renderSeries — renders one data series into an SVG graph.
     *
     * @param {string} seriesName  — e.g. "wave", "swell", "tide"
     * @param {string} graphId     — e.g. "height", "period"
     * @param {number[]} values    — 24 hourly data points
     * @param {number} min         — y scale minimum
     * @param {number} max         — y scale maximum
     * @param {string} dataAttr    — attribute name for dot value, e.g. "data-value"
     *
     * Path ID:  {seriesName}-{graphId}-path
     * Group ID: {seriesName}-{graphId}-dots
     */
    function renderSeries(seriesName, graphId, values, min, max, dataAttr) {
        const pathEl = el(`${seriesName}-${graphId}-path`);
        const group  = el(`${seriesName}-${graphId}-dots`);
        if (!pathEl || !group) return;

        // Update smooth 24-point path
        pathEl.setAttribute('d', buildPath(values, min, max));

        // Dots every 2h: 0,2,4,...,22 plus final dot at hour 23
        group.innerHTML = '';
        const dotHours = [0,2,4,6,8,10,12,14,16,18,20,22,24];
        dotHours.forEach(h => {
            const v = (h < 24 ? values[h] : values[23]) ?? 0;
            const circle = document.createElementNS(SVG_NS, 'circle');
            circle.setAttribute('cx', toX(h).toFixed(1));
            circle.setAttribute('cy', toY(v, min, max).toFixed(1));
            circle.setAttribute('r',  '2');
            circle.setAttribute('fill', 'currentColor');
            circle.setAttribute(dataAttr, v.toFixed(2));
            circle.classList.add(`color-${seriesName}`, 'graph-dot');
            group.appendChild(circle);
        });
    }

    // ─── Tooltip ──────────────────────────────────────────────────────────────

    function formatHour(cx) {
        const hour = Math.round((parseFloat(cx) - SVG_X_START) / (SVG_X_END - SVG_X_START) * 24);
        return String(Math.min(hour, 24)).padStart(2, '0') + ':00';
    }

    /**
     * setupTooltips — attaches hover tooltip to all .graph-dot inside an SVG.
     * Called after each render to re-attach on freshly generated dots.
     *
     * @param {string} svgId      — id of <svg> element
     * @param {Function} buildHTML — fn(dot) → HTML string for tooltip body
     */
    function setupTooltips(svgId, buildHTML) {
        const svgEl = el(svgId);
        if (!svgEl) return;

        const container = svgEl.closest('.telemetry-container');
        if (!container) return;

        // Remove old tooltip to avoid stacking
        container.querySelectorAll('.custom-graph-tooltip').forEach(t => t.remove());

        const tooltip = document.createElement('div');
        tooltip.className = 'custom-graph-tooltip';
        container.appendChild(tooltip);

        svgEl.querySelectorAll('.graph-dot').forEach(dot => {
            dot.addEventListener('mouseenter', () => {
                tooltip.innerHTML = buildHTML(dot);
                tooltip.style.display = 'block';
            });
            dot.addEventListener('mousemove', e => {
                const rect = container.getBoundingClientRect();
                tooltip.style.left = (e.clientX - rect.left + container.scrollLeft - tooltip.offsetWidth / 2) + 'px';
                tooltip.style.top  = (e.clientY - rect.top  + container.scrollTop  - 55) + 'px';
            });
            dot.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
            });
        });
    }

    // ─── Height graph (wave, swell, tide) ─────────────────────────────────────

    function renderHeightGraph(data) {
        const wave  = data.marine?.wave_height       || Array(24).fill(0);
        const swell = data.marine?.swell_wave_height || Array(24).fill(0);
        const tide  = (Array.isArray(data.tide) && data.tide.length) ? data.tide : Array(24).fill(0);

        // Y scale 0–4m
        renderSeries('wave',  'height', wave,  0, 4, 'data-value');
        renderSeries('swell', 'height', swell, 0, 4, 'data-value');
        renderSeries('tide',  'height', tide,  0, 4, 'data-value');

        setupTooltips('telemetry-svg-height', dot => {
            const cx      = parseFloat(dot.getAttribute('cx'));
            const timeStr = formatHour(cx);
            const height  = parseFloat(dot.getAttribute('data-value') || 0).toFixed(2);

            // Derive series name from class list: color-wave → wave
            let seriesName = 'tide';
            if (dot.classList.contains('color-wave'))  seriesName = 'wave';
            if (dot.classList.contains('color-swell')) seriesName = 'swell';

            const labels = { wave: 'Wave', swell: 'Swell', tide: 'Tide' };
            return `<div class="tt-title color-${seriesName}">${labels[seriesName]} (${timeStr})</div>
                    <div class="tt-row">height: <span class="tt-num">${height}m</span></div>`;
        });
    }

    // ─── Period graph (wave, swell) ───────────────────────────────────────────

    function renderPeriodGraph(data) {
        const wavePeriod  = data.marine?.wave_period       || Array(24).fill(0);
        const swellPeriod = data.marine?.swell_wave_period || Array(24).fill(0);

        // Y scale 0–16s (matches blueprint y_max=16)
        renderSeries('wave',  'period', wavePeriod,  0, 16, 'data-value');
        renderSeries('swell', 'period', swellPeriod, 0, 16, 'data-value');

        setupTooltips('telemetry-svg-period', dot => {
            const cx      = parseFloat(dot.getAttribute('cx'));
            const timeStr = formatHour(cx);
            const period  = parseFloat(dot.getAttribute('data-value') || 0).toFixed(1);

            let seriesName = 'swell';
            if (dot.classList.contains('color-wave')) seriesName = 'wave';

            const labels = { wave: 'Wave', swell: 'Swell' };
            return `<div class="tt-title color-${seriesName}">${labels[seriesName]} (${timeStr})</div>
                    <div class="tt-row">period: <span class="tt-num">${period}s</span></div>`;
        });
    }

    // ─── Safety evaluation ────────────────────────────────────────────────────

    function evaluateSafety(data) {
        const safe   = arr => (arr || []).filter(v => v != null);
        const maxVal = arr => safe(arr).length ? Math.max(...safe(arr)) : 0;

        const maxWave   = maxVal(data.marine?.wave_height);
        const maxSwell  = maxVal(data.marine?.swell_wave_height);
        const maxPeriod = maxVal(data.marine?.swell_wave_period);
        const maxWind   = maxVal(data.weather?.wind_speed_10m);

        if (maxWave >= 3.0 || maxSwell >= 2.5 || maxPeriod >= 16 || maxWind >= 50)
            return { status: 'DANGEROUS',          note: 'Do NOT fish — extreme conditions', color: 'red'    };
        if (maxWave >= 2.0 || maxSwell >= 2.0 || maxPeriod >= 12 || maxWind >= 35)
            return { status: 'HIGH RISK',           note: 'Experienced anglers only',         color: 'orange' };
        if (maxWave >= 1.5 || maxSwell >= 1.5 || maxWind >= 25)
            return { status: 'CONDITIONALLY SAFE', note: 'Watch for choppy swells',           color: 'yellow' };
        return         { status: 'SAFE',            note: 'Good conditions for fishing',       color: 'green'  };
    }

    // ─── Status bar ───────────────────────────────────────────────────────────

    function updateStatusBar(data) {
        const safety = evaluateSafety(data);

        setText('safety-status-strong', safety.status);
        setText('safety-status-note',   `(${safety.note})`);

        const colorMap = { red: '#ef4444', orange: '#f97316', yellow: '#eab308', green: '#10b981' };
        document.querySelectorAll('.status-indicator-dot').forEach(d => {
            d.style.backgroundColor = colorMap[safety.color];
        });

        const statusP = el('safety-status-p');
        if (statusP) {
            statusP.className = 'text-base leading-relaxed';
            const textMap = {
                red:    'text-red-600 dark:text-red-400',
                orange: 'text-orange-500 dark:text-orange-400',
                yellow: 'text-yellow-600 dark:text-yellow-400',
                green:  'status-text-green',
            };
            statusP.classList.add(...textMap[safety.color].split(' '));
        }

        if (data.sr) setText('sunrise-value',       data.sr);
        if (data.ss) setText('sunset-value',         data.ss);
        if (data.major) {
            const clean = data.major
                .trim();
            setText('fish-activity-value', clean);
        }
        if (data.fetched_at) {
            const d   = new Date(data.fetched_at);
            const fmt = d.toLocaleString('en-AU', {
                weekday: 'short', day: 'numeric', month: 'short',
                hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney'
            });
            setText('data-updated-time', `${fmt} AEST`);
        }

        const banner = el('partial-status-banner');
        if (banner) banner.style.display = data.status === 'partial' ? 'block' : 'none';
    }

    // ─── AI Analysis panel ────────────────────────────────────────────────────

    function updateAnalysisPanel(data) {
        const panel = el('ai-analysis-panel');
        if (!panel) return;

        if (!data.analysis) {
            panel.innerHTML = `
                <div class="flex items-center gap-2 text-sm text-neutral-400 dark:text-neutral-500">
                    <svg class="animate-spin h-4 w-4 text-blue-400 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 14.627 0 20 12h-4a4 4 0 00-4-4V4A8 8 0 014 12z"></path>
                    </svg>
                    AI analysis generating... auto-refreshing shortly.
                </div>`;
        } else {
            function escapeHTML(str) {
                return String(str || '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
            }

            function inlineMarkdown(str) {
                return escapeHTML(str)
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            }

            function formatAIAnalysis(text) {
                const lines = String(text || '')
                    .split('\n')
                    .map(line => line.trim())
                    .filter(Boolean);

                let html = '';
                let inList = false;

                function closeList() {
                    if (inList) {
                        html += '</ul>';
                        inList = false;
                    }
                }

                lines.forEach(line => {
                    // Heading: ## or ###
                    if (/^#{2,4}\s+/.test(line)) {
                        closeList();
                        const title = line.replace(/^#{2,4}\s+/, '');
                        html += `<h4>${inlineMarkdown(title)}</h4>`;
                        return;
                    }

                    // Bullet: * item or - item
                    if (/^(\*|-)\s+/.test(line)) {
                        if (!inList) {
                            html += '<ul>';
                            inList = true;
                        }
                        const item = line.replace(/^(\*|-)\s+/, '');
                        html += `<li>${inlineMarkdown(item)}</li>`;
                        return;
                    }

                    closeList();
                    html += `<p>${inlineMarkdown(line)}</p>`;
                });

                closeList();

                return html || '<p>No analysis available.</p>';
            }

            panel.innerHTML = formatAIAnalysis(data.analysis);

            if (data.model_used) {
                panel.innerHTML += `<div class="ai-analysis-model">Model: ${data.model_used}</div>`;
            }
        }
    }

    // ─── Loading state ────────────────────────────────────────────────────────

    function setLoading(on) {
        const btn     = el('weather-check-btn');
        const overlay = el('graph-loading-overlay');
        if (btn)     { btn.disabled = on; btn.textContent = on ? 'Loading...' : 'Check'; }
        if (overlay) { overlay.style.display = on ? 'flex' : 'none'; }
    }

    function setError(msg) {
        setText('safety-status-strong', 'ERROR');
        setText('safety-status-note',   '');
        const panel = el('ai-analysis-panel');
        if (panel) panel.innerHTML = `<p class="text-sm text-red-500 dark:text-red-400">⚠️ ${msg}</p>`;
    }

    // ─── Main fetch ───────────────────────────────────────────────────────────

    async function fetchWeather() {
        const locInput   = el('location-input');
        const dateSelect = el('date-select');
        if (!locInput || !dateSelect) return;

        const loc     = resolveLocation();
        const dateStr = dateSelect.value;
        if (!dateStr) return;

        setLoading(true);

        const url = `${API_BASE}?lat=${loc.lat}&lon=${loc.lon}&date=${dateStr}&name=${encodeURIComponent(loc.name)}`;

        try {
            const res  = await fetch(url);
            if (!res.ok) throw new Error(`API error ${res.status}`);
            const data = await res.json();

            updateStatusBar(data);
            renderHeightGraph(data);
            renderPeriodGraph(data);
            updateAnalysisPanel(data);

            if (data.status === 'partial') {
                setTimeout(fetchWeather, 8000);
            }
        } catch (err) {
            console.error('[weather-fetch]', err);
            setError(`Could not load data: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }

    // ─── Init ─────────────────────────────────────────────────────────────────
    function init() {
        const btn      = el('weather-check-btn');
        const locInput = el('location-input');

        if (btn) btn.addEventListener('click', fetchWeather);
        fetchWeather();
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();