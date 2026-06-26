/**
 * weather-fetch.js
 * Handles API fetch, DOM updates, and SVG graph rendering
 * for fishing.adiendendra.com
 */

(function () {
    'use strict';

    const API_BASE = 'https://api.fishing.adiendendra.com/weather';

    // Location name → lat/lon mapping for Sydney rock fishing spots
    const LOCATIONS = {
        'botany bay':         { lat: -33.9929, lon: 151.2172 },
        'bondi beach':        { lat: -33.8908, lon: 151.2743 },
        'coogee beach':       { lat: -33.9209, lon: 151.2585 },
        'cronulla':           { lat: -34.0574, lon: 151.1519 },
        'dee why':            { lat: -33.7510, lon: 151.2946 },
        'long reef':          { lat: -33.7397, lon: 151.3015 },
        'port hacking':       { lat: -34.0653, lon: 151.1480 },
        'sydney harbour':     { lat: -33.8568, lon: 151.2153 },
    };

    
    // Default location
    const DEFAULT_LOCATION = 'botany bay';

    // SVG graph constants
    const SVG = {
        xStart: 60,
        xEnd: 840,
        yTop: 40,
        yBottom: 360,
        // x spacing per 2-hour interval (13 points: 0,2,4,...24)
        xStep: 65,  // (840-60)/12
    };

    // ─── DOM helpers ─────────────────────────────────────────────────────────

    function el(id) { return document.getElementById(id); }

    function setText(id, value) {
        const elem = el(id);
        if (elem) elem.textContent = value;
    }

    function setHTML(id, value) {
        const elem = el(id);
        if (elem) elem.innerHTML = value;
    }

    // ─── Location resolution ──────────────────────────────────────────────────

    function resolveLocation(inputText) {
        const key = inputText.trim().toLowerCase();

        // Exact match
        if (LOCATIONS[key]) return { ...LOCATIONS[key], name: inputText.trim() };

        // Partial match
        for (const [name, coords] of Object.entries(LOCATIONS)) {
            if (name.includes(key) || key.includes(name.split(' ')[0])) {
                return { ...coords, name: name.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') };
            }
        }

        // Default fallback
        return { ...LOCATIONS[DEFAULT_LOCATION], name: 'Botany Bay' };
    }

    // ─── Safety status logic ──────────────────────────────────────────────────

    function evaluateSafety(data) {
        const wave = data.marine?.wave_height || [];
        const swell = data.marine?.swell_wave_height || [];
        const swellPeriod = data.marine?.swell_wave_period || [];
        const wind = data.weather?.wind_speed_10m || [];

        const maxWave = Math.max(...wave.filter(v => v !== null && v !== undefined), 0);
        const maxSwell = Math.max(...swell.filter(v => v !== null && v !== undefined), 0);
        const maxPeriod = Math.max(...swellPeriod.filter(v => v !== null && v !== undefined), 0);
        const maxWind = Math.max(...wind.filter(v => v !== null && v !== undefined), 0);

        if (maxWave >= 3.0 || maxSwell >= 2.5 || maxPeriod >= 16 || maxWind >= 50) {
            return { status: 'DANGEROUS', note: 'Do NOT fish — extreme conditions', color: 'red' };
        } else if (maxWave >= 2.0 || maxSwell >= 2.0 || maxPeriod >= 12 || maxWind >= 35) {
            return { status: 'HIGH RISK', note: 'Experienced anglers only', color: 'orange' };
        } else if (maxWave >= 1.5 || maxSwell >= 1.5 || maxWind >= 25) {
            return { status: 'CONDITIONALLY SAFE', note: 'Watch for choppy swells', color: 'yellow' };
        } else {
            return { status: 'SAFE', note: 'Good conditions for fishing', color: 'green' };
        }
    }

    // ─── Update status bar in weather-top ────────────────────────────────────

    function updateStatusBar(data) {
        const safety = evaluateSafety(data);

        // Safety status text
        const statusNote = el('safety-status-note');
        const statusStrong = el('safety-status-strong');
        if (statusStrong) statusStrong.textContent = safety.status;
        if (statusNote) statusNote.textContent = `(${safety.note})`;

        // Dot color
        const dots = document.querySelectorAll('.status-indicator-dot');
        const colorMap = {
            red: '#ef4444', orange: '#f97316',
            yellow: '#eab308', green: '#10b981'
        };
        dots.forEach(d => { d.style.backgroundColor = colorMap[safety.color]; });

        // Status text color
        const statusP = el('safety-status-p');
        if (statusP) {
            statusP.className = statusP.className.replace(/text-\w+-\d+/g, '');
            const textColorMap = {
                red: 'text-red-600 dark:text-red-400',
                orange: 'text-orange-500 dark:text-orange-400',
                yellow: 'text-yellow-600 dark:text-yellow-400',
                green: 'status-text-green'
            };
            statusP.classList.add(...textColorMap[safety.color].split(' '));
        }

        // Sunrise / sunset
        if (data.sr) setText('sunrise-value', data.sr);
        if (data.ss) setText('sunset-value', data.ss);

        // Fish activity — pick the "major" period from astro data
        if (data.major) {
            // Strip emoji and "Major:" prefix for compact display
            const clean = data.major.replace(/🐟+\s*\*?Major:\*?\s*/i, '').split('&')[0].trim();
            setText('fish-activity-value', `Major (${clean})`);
        }

        // Updated timestamp
        if (data.fetched_at) {
            const d = new Date(data.fetched_at);
            const fmt = d.toLocaleString('en-AU', {
                weekday: 'short', day: 'numeric', month: 'short',
                hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney'
            });
            setText('data-updated-time', `${fmt} AEST`);
        }

        // Partial status banner
        const partialBanner = el('partial-status-banner');
        if (partialBanner) {
            if (data.status === 'partial') {
                partialBanner.style.display = 'block';
            } else {
                partialBanner.style.display = 'none';
            }
        }
    }

    // ─── SVG graph helpers ────────────────────────────────────────────────────

    /**
     * Map a data value to SVG y-coordinate.
     * @param {number} value  - the data value
     * @param {number} minVal - minimum of the scale
     * @param {number} maxVal - maximum of the scale
     */
    function valueToY(value, minVal, maxVal) {
        const range = maxVal - minVal;
        if (range === 0) return SVG.yBottom;
        const ratio = (value - minVal) / range;
        return SVG.yBottom - ratio * (SVG.yBottom - SVG.yTop);
    }

    /**
     * Map hour index (0-23) to SVG x-coordinate.
     * We display 13 points at hours 0,2,4,...24.
     * The API returns 24 hourly values; we sample every 2 hours.
     */
    function hourToX(hour) {
        // hour 0 → x=60, hour 24 → x=840
        return SVG.xStart + (hour / 24) * (SVG.xEnd - SVG.xStart);
    }

    /**
     * Build SVG path "d" attribute from array of {x, y} points.
     */
    function buildPath(points) {
        if (points.length === 0) return '';
        return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    }

    /**
     * Interpolate path through all 24 hourly points for smooth curve.
     * Also returns sampled points at even hours for dots (every 2h).
     */
    function buildSeries(values, minVal, maxVal) {
        // Full 24-point path (hours 0-23)
        const pathPoints = values.map((v, i) => ({
            x: hourToX(i),
            y: valueToY(v ?? 0, minVal, maxVal)
        }));

        // Sample every 2 hours for dots + tooltip (13 points: 0,2,4,...,24)
        const dotPoints = [];
        for (let h = 0; h <= 24; h += 2) {
            const v = h < 24 ? (values[h] ?? 0) : (values[23] ?? 0);
            dotPoints.push({ x: hourToX(h), y: valueToY(v, minVal, maxVal), value: v, hour: h });
        }

        return { pathPoints, dotPoints };
    }

    /**
     * Update an SVG group of dots with new positions.
     * @param {SVGElement} svgEl
     * @param {string} selector - CSS selector for the dots
     * @param {Array} dotPoints - array of {x, y, value, hour}
     * @param {string} dataAttr - attribute name to store value (e.g. 'data-value')
     */
    function updateDots(svgEl, selector, dotPoints, dataAttr) {
        const dots = svgEl.querySelectorAll(selector);
        dots.forEach((dot, i) => {
            if (i < dotPoints.length) {
                dot.setAttribute('cx', dotPoints[i].x.toFixed(1));
                dot.setAttribute('cy', dotPoints[i].y.toFixed(1));
                dot.setAttribute(dataAttr, dotPoints[i].value?.toFixed(2) ?? '0');
            }
        });
    }

    /**
     * Update an SVG <path> element.
     */
    function updatePath(svgEl, selector, pathPoints) {
        const path = svgEl.querySelector(selector);
        if (path) path.setAttribute('d', buildPath(pathPoints));
    }

    // ─── Height graph (wave_height, swell_wave_height, tide) ─────────────────

    function renderHeightGraph(data) {
        const svgNS = 'http://www.w3.org/2000/svg';
        
        function renderSeries(pathId, groupId, values, minV, maxV, attr, cssClass) {
            const pathEl = el(pathId);
            const group  = el(groupId);
            if (!pathEl || !group) return;
            
            // Build 24-point smooth path
            const pts = values.map((v, i) => ({
                x: hourToX(i), y: valueToY(v ?? 0, minV, maxV)
            }));
            pathEl.setAttribute('d', buildPath(pts));
            
            // Clear old dots, generate fresh
            group.innerHTML = '';
            for (let h = 0; h <= 24; h += 2) {
                const v = h < 24 ? (values[h] ?? 0) : (values[23] ?? 0);
                const circle = document.createElementNS(svgNS, 'circle');
                circle.setAttribute('cx', hourToX(h).toFixed(1));
                circle.setAttribute('cy', valueToY(v, minV, maxV).toFixed(1));
                circle.setAttribute('r', '2');
                circle.setAttribute(attr, v.toFixed(2));
                circle.setAttribute('fill', 'currentColor');
                circle.classList.add(cssClass, 'graph-dot');
                group.appendChild(circle);
            }
        }

        renderSeries('wave-height-path',  'wave-height-dots',  data.marine?.wave_height       || [], 0, 4, 'data-period', 'color-wave');
        renderSeries('swell-height-path', 'swell-height-dots', data.marine?.swell_wave_height || [], 0, 4, 'data-period', 'color-swell');
        renderSeries('tide-path',         'tide-dots',         data.tide || [],                    0, 4, 'data-value',  'color-tide');
    }

    // ─── Period graph (swell_wave_period) ─────────────────────────────────────

    function renderPeriodGraph(data) {
        const svgEl = el('period-telemetry-svg');
        if (!svgEl) return;

        // Open-Meteo: wave_period is in marine hourly
        // Note: API may return wave_period and swell_wave_period separately
        const wavePeriod  = data.marine?.wave_period       || Array(24).fill(0);
        const swellPeriod = data.marine?.swell_wave_period || Array(24).fill(0);

        // Y scale: 0–20s
        const minP = 0, maxP = 20.0;

        const waveSeries  = buildSeries(wavePeriod,  minP, maxP);
        const swellSeries = buildSeries(swellPeriod, minP, maxP);

        const wavePathEl  = svgEl.querySelector('path.color-wave');
        const swellPathEl = svgEl.querySelector('path.color-swell');

        if (wavePathEl)  wavePathEl.setAttribute('d',  buildPath(waveSeries.pathPoints));
        if (swellPathEl) swellPathEl.setAttribute('d', buildPath(swellSeries.pathPoints));

        const allDots  = svgEl.querySelectorAll('.graph-dot');
        const waveDots  = Array.from(allDots).filter(d => d.classList.contains('color-wave'));
        const swellDots = Array.from(allDots).filter(d => d.classList.contains('color-swell'));

        function applyDots(dots, series) {
            dots.forEach((dot, i) => {
                if (i < series.dotPoints.length) {
                    dot.setAttribute('cx', series.dotPoints[i].x.toFixed(1));
                    dot.setAttribute('cy', series.dotPoints[i].y.toFixed(1));
                    dot.setAttribute('data-value', series.dotPoints[i].value?.toFixed(1) ?? '0');
                }
            });
        }

        applyDots(waveDots,  waveSeries);
        applyDots(swellDots, swellSeries);
    }

    // ─── AI Analysis panel ────────────────────────────────────────────────────

    function updateAnalysisPanel(data) {
        const panel = el('ai-analysis-panel');
        if (!panel) return;

        if (data.status === 'partial' || !data.analysis) {
            panel.innerHTML = `
                <div class="flex items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400 italic">
                    <svg class="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 14.627 0 20 12h-4a4 4 0 00-4-4V4A8 8 0 014 12z"></path>
                    </svg>
                    AI analysis is being generated... refresh in a few seconds.
                </div>`;
        } else {
            panel.innerHTML = `<p class="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">${data.analysis}</p>`;
            if (data.model_used) {
                panel.innerHTML += `<p class="text-xs text-neutral-400 dark:text-neutral-500 mt-2">Powered by ${data.model_used}</p>`;
            }
        }
    }

    // ─── Loading state ────────────────────────────────────────────────────────

    function setLoading(isLoading) {
        const btn = el('weather-check-btn');
        const overlay = el('graph-loading-overlay');

        if (btn) {
            btn.disabled = isLoading;
            btn.textContent = isLoading ? 'Loading...' : 'Check';
        }
        if (overlay) {
            overlay.style.display = isLoading ? 'flex' : 'none';
        }
    }

    function setError(message) {
        const panel = el('ai-analysis-panel');
        if (panel) {
            panel.innerHTML = `<p class="text-sm text-red-500 dark:text-red-400">⚠️ ${message}</p>`;
        }
        // Also show in status
        const statusStrong = el('safety-status-strong');
        if (statusStrong) statusStrong.textContent = 'ERROR';
    }

    // ─── Main fetch ───────────────────────────────────────────────────────────

    async function fetchWeather() {
        const locInput = el('location-input');
        const dateSelect = el('date-select');

        if (!locInput || !dateSelect) return;

        const location = resolveLocation(locInput.value || DEFAULT_LOCATION);
        const dateStr = dateSelect.value;

        if (!dateStr) return;

        setLoading(true);

        const url = `${API_BASE}?lat=${location.lat}&lon=${location.lon}&date=${dateStr}&name=${encodeURIComponent(location.name)}`;

        try {
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`API error ${response.status}`);
            }

            const data = await response.json();

            // Update all UI components
            updateStatusBar(data);
            renderHeightGraph(data);
            renderPeriodGraph(data);
            updateAnalysisPanel(data);

            // If partial, auto-refresh after 8 seconds to get complete data
            if (data.status === 'partial') {
                setTimeout(fetchWeather, 8000);
            }

        } catch (err) {
            console.error('Weather fetch error:', err);
            setError(`Could not load weather data: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }

    // ─── Auto-populate location input from known locations ────────────────────

    function setupLocationAutocomplete() {
        const input = el('location-input');
        if (!input) return;

        // Set default
        input.placeholder = 'Botany Bay';

        input.addEventListener('blur', function () {
            if (!this.value.trim()) {
                this.value = '';
            }
        });
    }

    // ─── Init ─────────────────────────────────────────────────────────────────

    function init() {
        setupLocationAutocomplete();

        // Attach button click
        const btn = el('weather-check-btn');
        if (btn) {
            btn.addEventListener('click', fetchWeather);
        }

        // Auto-fetch on page load with defaults (today, Botany Bay)
        fetchWeather();
    }

    // Run after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ─── Tool tip  ─────────────────────────────────────────────────────────────────

    function setupTooltips() {
        const tooltip = document.getElementById('graph-tooltip');
        
        document.addEventListener('mouseover', (e) => {
            if (e.target.classList.contains('graph-dot')) {
                const val = e.target.getAttribute('data-value') || e.target.getAttribute('data-period');
                tooltip.textContent = `Value: ${val}`;
                tooltip.style.display = 'block';
                tooltip.style.left = (e.pageX + 10) + 'px';
                tooltip.style.top = (e.pageY + 10) + 'px';
            }
        });

        document.addEventListener('mouseout', (e) => {
            if (e.target.classList.contains('graph-dot')) {
                tooltip.style.display = 'none';
            }
        });
    }

})();