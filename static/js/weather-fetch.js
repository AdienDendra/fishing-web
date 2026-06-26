/**
 * weather-fetch.js
 * Handles API fetch, DOM updates, and SVG graph rendering
 * for fishing.adiendendra.com
 *
 * SVG IDs (from weather-graph-blueprint.html):
 *   Height graph: telemetry-svg-height
 *     paths : wave-height-path, swell-height-path, tide-path
 *     groups: wave-height-dots, swell-height-dots, tide-dots
 *   Period graph: telemetry-svg-period
 *     paths : wave-period-path, swell-period-path
 *     groups: wave-period-dots, swell-period-dots
 */

(function () {
    'use strict';

    const API_BASE = 'https://api.fishing.adiendendra.com/weather';
    const SVG_NS   = 'http://www.w3.org/2000/svg';

    // Known Sydney rock fishing locations
    const LOCATIONS = {
        'botany bay':     { lat: -33.9929, lon: 151.2172 },
        'bondi beach':    { lat: -33.8908, lon: 151.2743 },
        'coogee beach':   { lat: -33.9209, lon: 151.2585 },
        'cronulla':       { lat: -34.0574, lon: 151.1519 },
        'dee why':        { lat: -33.7510, lon: 151.2946 },
        'long reef':      { lat: -33.7397, lon: 151.3015 },
        'port hacking':   { lat: -34.0653, lon: 151.1480 },
        'sydney harbour': { lat: -33.8568, lon: 151.2153 },
    };

    // SVG coordinate constants (matches viewBox="0 0 900 410")
    const SVG_X_START = 60;
    const SVG_X_END   = 840;
    const SVG_Y_TOP   = 40;
    const SVG_Y_BOT   = 360;

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function el(id) { return document.getElementById(id); }
    function setText(id, val) { const e = el(id); if (e) e.textContent = val; }

    function resolveLocation(input) {
        const key = (input || '').trim().toLowerCase();
        if (LOCATIONS[key]) return { ...LOCATIONS[key], name: titleCase(key) };
        for (const [name, coords] of Object.entries(LOCATIONS)) {
            if (key && (name.includes(key) || key.includes(name.split(' ')[0]))) {
                return { ...coords, name: titleCase(name) };
            }
        }
        return { ...LOCATIONS['botany bay'], name: 'Botany Bay' };
    }

    function titleCase(str) {
        return str.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
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
        return values.map((v, i) => {
            const x = toX(i).toFixed(1);
            const y = toY(v, min, max).toFixed(1);
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        }).join(' ');
    }

    /**
     * renderSeries — updates one data series inside an SVG:
     *   - Sets <path id="{pathId}"> with smooth 24-point line
     *   - Clears <g id="{groupId}"> and generates fresh dots every 2h (13 dots)
     */
    function renderSeries(pathId, groupId, values, min, max, dotAttr, cssClass) {
        const pathEl = el(pathId);
        const group  = el(groupId);
        if (!pathEl || !group) return;

        // Update path (24 hourly points)
        pathEl.setAttribute('d', buildPath(values, min, max));

        // Regenerate dots every 2h → 13 points: 0,2,4,...,24
        group.innerHTML = '';
        for (let h = 0; h <= 24; h += 2) {
            const v = h < 24 ? (values[h] ?? 0) : (values[23] ?? 0);
            const circle = document.createElementNS(SVG_NS, 'circle');
            circle.setAttribute('cx', toX(h).toFixed(1));
            circle.setAttribute('cy', toY(v, min, max).toFixed(1));
            circle.setAttribute('r',  '2');
            circle.setAttribute('fill', 'currentColor');
            circle.setAttribute(dotAttr, v.toFixed(2));
            circle.classList.add(cssClass, 'graph-dot');
            group.appendChild(circle);
        }
    }

    // ─── Height graph ─────────────────────────────────────────────────────────

    function renderHeightGraph(data) {
        const wave  = data.marine?.wave_height       || Array(24).fill(0);
        const swell = data.marine?.swell_wave_height || Array(24).fill(0);
        const tide  = (Array.isArray(data.tide) && data.tide.length) ? data.tide : Array(24).fill(0);

        // Y scale 0–4m
        renderSeries('wave-height-path',  'wave-height-dots',  wave,  0, 4, 'data-value', 'color-wave');
        renderSeries('swell-height-path', 'swell-height-dots', swell, 0, 4, 'data-value', 'color-swell');
        renderSeries('tide-path',         'tide-dots',         tide,  0, 4, 'data-value', 'color-tide');

        // Attach tooltips after dots are regenerated
        setupTooltips('telemetry-svg-height', function(dot) {
            const cx     = parseFloat(dot.getAttribute('cx'));
            const timeStr = formatHour(cx);
            const height  = parseFloat(dot.getAttribute('data-value') || 0).toFixed(2);
            let label = 'Tide', cls = 'color-tide';
            if (dot.classList.contains('color-wave'))  { label = 'Wave';  cls = 'color-wave';  }
            if (dot.classList.contains('color-swell')) { label = 'Swell'; cls = 'color-swell'; }
            return `<div class="tt-title ${cls}">${label} (${timeStr})</div>
                    <div class="tt-row">height: <span class="tt-num">${height}m</span></div>`;
        });
    }

    // ─── Period graph ─────────────────────────────────────────────────────────

    function renderPeriodGraph(data) {
        const wavePeriod  = data.marine?.wave_period       || Array(24).fill(0);
        const swellPeriod = data.marine?.swell_wave_period || Array(24).fill(0);

        // Y scale 0–16s (matches blueprint y_max=16)
        renderSeries('wave-period-path',  'wave-period-dots',  wavePeriod,  0, 16, 'data-value', 'color-wave');
        renderSeries('swell-period-path', 'swell-period-dots', swellPeriod, 0, 16, 'data-value', 'color-swell');

        setupTooltips('telemetry-svg-period', function(dot) {
            const cx      = parseFloat(dot.getAttribute('cx'));
            const timeStr = formatHour(cx);
            const period  = parseFloat(dot.getAttribute('data-value') || 0).toFixed(1);
            let label = 'Swell', cls = 'color-swell';
            if (dot.classList.contains('color-wave')) { label = 'Wave'; cls = 'color-wave'; }
            return `<div class="tt-title ${cls}">${label} (${timeStr})</div>
                    <div class="tt-row">period: <span class="tt-num">${period}s</span></div>`;
        });
    }

    // ─── Tooltip (shared, reusable per SVG) ──────────────────────────────────

    function formatHour(cx) {
        const hour = Math.round((parseFloat(cx) - SVG_X_START) / (SVG_X_END - SVG_X_START) * 24);
        return String(Math.min(hour, 24)).padStart(2, '0') + ':00';
    }

    /**
     * setupTooltips — attaches hover tooltip to all .graph-dot inside svgId.
     * Called after each renderSeries to re-attach on fresh dots.
     * @param {string} svgId      - id of the <svg> element
     * @param {Function} buildHTML - fn(dot) → HTML string for tooltip content
     */
    function setupTooltips(svgId, buildHTML) {
        const svgEl = el(svgId);
        if (!svgEl) return;

        const container = svgEl.closest('.telemetry-container');
        if (!container) return;

        // Remove any existing tooltip for this container
        container.querySelectorAll('.custom-graph-tooltip').forEach(t => t.remove());

        const tooltip = document.createElement('div');
        tooltip.className = 'custom-graph-tooltip';
        container.appendChild(tooltip);

        svgEl.querySelectorAll('.graph-dot').forEach(dot => {
            dot.addEventListener('mouseenter', function () {
                tooltip.innerHTML = buildHTML(dot);
                tooltip.style.display = 'block';
            });
            dot.addEventListener('mousemove', function (e) {
                const rect = container.getBoundingClientRect();
                tooltip.style.left = (e.clientX - rect.left + container.scrollLeft + 12) + 'px';
                tooltip.style.top  = (e.clientY - rect.top  + container.scrollTop  - 12) + 'px';
            });
            dot.addEventListener('mouseleave', function () {
                tooltip.style.display = 'none';
            });
        });
    }

    // ─── Safety evaluation ────────────────────────────────────────────────────

    function evaluateSafety(data) {
        const safe   = (arr) => (arr || []).filter(v => v != null);
        const maxVal = (arr) => safe(arr).length ? Math.max(...safe(arr)) : 0;

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
                .replace(/[\u{1F40F}\u{1F41F}]+\s*/gu, '')
                .replace(/\*?Major:\*?\s*/i, '')
                .split('&')[0].trim();
            setText('fish-activity-value', `Major (${clean})`);
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
                <div class="flex items-center gap-2 text-sm text-neutral-400 dark:text-neutral-500 italic">
                    <svg class="animate-spin h-4 w-4 text-blue-400 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 14.627 0 20 12h-4a4 4 0 00-4-4V4A8 8 0 014 12z"></path>
                    </svg>
                    AI analysis generating... auto-refreshing shortly.
                </div>`;
        } else {
            const escaped = data.analysis.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            panel.innerHTML = `<p class="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">${escaped}</p>`;
            if (data.model_used) {
                panel.innerHTML += `<p class="text-xs text-neutral-400 dark:text-neutral-500 mt-2 font-mono">Model: ${data.model_used}</p>`;
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

        const loc     = resolveLocation(locInput.value);
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

            // Auto-retry if AI analysis not yet ready
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
        const btn = el('weather-check-btn');
        if (btn) btn.addEventListener('click', fetchWeather);
        fetchWeather();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();