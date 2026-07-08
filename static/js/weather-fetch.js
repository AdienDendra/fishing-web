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

    let lastWeatherData = null;
    let lastLocationName = '';
    let lastSelectedDate = '';
    let lastSelectedDateLabel = '';
    let lastAssessmentHour = null;    

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function el(id) { return document.getElementById(id); }

    function setText(id, val) { const e = el(id); if (e) e.textContent = val; }

    function escapeHTML(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    
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
            dot.addEventListener('click', e => {
                tooltip.innerHTML = buildHTML(dot);
                tooltip.style.display = 'block';

                const rect = container.getBoundingClientRect();
                tooltip.style.left = (e.clientX - rect.left + container.scrollLeft - tooltip.offsetWidth / 2) + 'px';
                tooltip.style.top  = (e.clientY - rect.top + container.scrollTop - 55) + 'px';

                setTimeout(() => {
                    tooltip.style.display = 'none';
                }, 2200);
            });           
        });
    }
    
    function fillMissingSeries(series) {
        const filled = [...series];

        // Isi data kosong dari nilai jam sebelumnya
        for (let i = 0; i < filled.length; i++) {
            if (filled[i] == null) {
                const prev = i > 0 ? filled[i - 1] : null;
                filled[i] = prev;
            }
        }

        // Kalau data kosong ada di awal hari, isi dari nilai jam berikutnya
        for (let i = filled.length - 1; i >= 0; i--) {
            if (filled[i] == null) {
                const next = i < filled.length - 1 ? filled[i + 1] : null;
                filled[i] = next;
            }
        }

        // Fallback terakhir: kalau semua data kosong, baru jadikan 0
        return filled.map(v => Number.isFinite(Number(v)) ? Number(v) : 0);
    }
        
    function extractTideHeightSeries(tideData) {
        // Legacy support: old backend returned a plain 24-hour array.
        if (Array.isArray(tideData)) {
            return tideData
                .slice(0, 24)
                .map(v => Number.isFinite(Number(v)) ? Number(v) : 0);
        }

        const series = Array(24).fill(null);
        const heights = Array.isArray(tideData?.heights) ? tideData.heights : [];

        heights.forEach(item => {
            const time = String(item?.time || '');
            const hour = Number(time.slice(11, 13));

            // Prefer display_height because backend calibrated it for angler-facing display.
            const rawValue =
                item?.display_height ??
                item?.height_msl ??
                item?.height;

            const value = Number(rawValue);

            if (
                Number.isInteger(hour) &&
                hour >= 0 &&
                hour < 24 &&
                Number.isFinite(value)
            ) {
                series[hour] = value;
            }
        });
        return fillMissingSeries(series);
    }


    // ─── Height graph (wave, swell, tide) ─────────────────────────────────────

    function renderHeightGraph(data) {
        const wave  = data.marine?.wave_height       || Array(24).fill(0);
        const swell = data.marine?.swell_wave_height || Array(24).fill(0);
        const tide = extractTideHeightSeries(data.tide);
        
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
            return `<div class="tt-head">
                        <span class="tt-label color-${seriesName}">${labels[seriesName]} Height</span>
                    </div>
                    <div class="tt-value color-${seriesName}">${height}m</div>`;

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
            return `<div class="tt-head">
                        <span class="tt-label color-${seriesName}">${labels[seriesName]} Period</span>
                    </div>
                    <div class="tt-value color-${seriesName}">${period}s</div>`;
        });
    }

    // ─── Safety evaluation ────────────────────────────────────────────────────
    function getAt(arr, hour) {
        if (!Array.isArray(arr)) return null;
        const v = Number(arr[hour]);
        return Number.isFinite(v) ? v : null;
    }

    function maxNullable(...values) {
        const valid = values.filter(v => Number.isFinite(v));
        return valid.length ? Math.max(...valid) : null;
    }

    function scoreFromStops(value, stops) {
        if (!Number.isFinite(value)) return null;

        if (value <= stops[0].v) return stops[0].s;

        for (let i = 1; i < stops.length; i++) {
            const prev = stops[i - 1];
            const next = stops[i];

            if (value <= next.v) {
                const ratio = (value - prev.v) / (next.v - prev.v || 1);
                return prev.s + ratio * (next.s - prev.s);
            }
        }

        return stops[stops.length - 1].s;
    }

    function scoreFromWavePower(wavePowerProxy) {
        return scoreFromStops(wavePowerProxy, [
            { v: 0,  s: 0  },
            { v: 4,  s: 25 },
            { v: 12, s: 45 },
            { v: 25, s: 65 },
            { v: 50, s: 85 },
            { v: 80, s: 100 }
        ]);
    }

    function scoreFromSeaHeightOnly(seaHeight) {
        return scoreFromStops(seaHeight, [
            { v: 0,   s: 0  },
            { v: 0.8, s: 25 },
            { v: 1.3, s: 45 },
            { v: 1.8, s: 65 },
            { v: 2.5, s: 85 },
            { v: 3.5, s: 100 }
        ]);
    }

    function scoreFromWind(wind) {
        return scoreFromStops(wind, [
            { v: 0,  s: 0  },
            { v: 10, s: 25 },
            { v: 20, s: 45 },
            { v: 30, s: 65 },
            { v: 38, s: 85 },
            { v: 50, s: 100 }
        ]);
    }

    function statusFromScore(score) {
        if (score >= 85) {
            return {
                status: 'EXTREME',
                note: 'No-go conditions',
                color: 'darkred'
            };
        }

        if (score >= 65) {
            return {
                status: 'DANGEROUS',
                note: 'Do NOT fish',
                color: 'red'
            };
        }

        if (score >= 45) {
            return {
                status: 'HIGH RISK',
                note: 'Strong caution required',
                color: 'orange'
            };
        }

        if (score >= 25) {
            return {
                status: 'CONDITIONALLY SAFE',
                note: 'Use caution',
                color: 'yellow'
            };
        }

        return {
            status: 'SAFE',
            note: 'Low-risk conditions',
            color: 'green'
        };
    }

    function getAssessmentWindow() {
        const now = new Date();
        const startHour = Math.max(0, Math.min(23, now.getHours()));
        const endHour = Math.min(startHour + 1, 24);

        return {
            startHour,
            endHour,
            label: `${formatHourLabel(startHour)}–${formatHourLabel(endHour)}`
        };
    }

    function formatHourLabel(hour) {
        return String(hour).padStart(2, '0') + ':00';
    }

    function formatSelectedDateLabel(dateSelect) {
        if (!dateSelect) return '';

        const opt = dateSelect.options[dateSelect.selectedIndex];
        const raw = (opt?.textContent || dateSelect.value || '').trim();

        return raw
            .replace(/^Today\s*\((.+)\)$/i, '$1')
            .replace(/^Tomorrow\s*\((.+)\)$/i, '$1');
    }

    function formatMetric(value, digits, suffix) {
        return Number.isFinite(value)
            ? `${value.toFixed(digits)}${suffix}`
            : `—${suffix}`;
    }

    function isLoadedDateToday() {
        const loadedDate = lastSelectedDate || getSelectedForecastDate();
        return loadedDate === getTodayDateString();
    }    

    function evaluateSafetyForHour(data, hour) {
        const wave        = getAt(data.marine?.wave_height, hour);
        const swell       = getAt(data.marine?.swell_wave_height, hour);
        const wavePeriod  = getAt(data.marine?.wave_period, hour);
        const swellPeriod = getAt(data.marine?.swell_wave_period, hour);
        const wind        = getAt(data.weather?.wind_speed_10m, hour);

        const seaHeight = maxNullable(wave, swell);
        const period    = maxNullable(wavePeriod, swellPeriod);

        let wavePowerProxy = null;
        let waveRiskScore  = null;

        if (seaHeight !== null && period !== null) {
            wavePowerProxy = seaHeight * seaHeight * period;
            waveRiskScore = scoreFromWavePower(wavePowerProxy);
        } else if (seaHeight !== null) {
            waveRiskScore = scoreFromSeaHeightOnly(seaHeight);
        }

        const windRiskScore = wind !== null ? scoreFromWind(wind) : null;

        const scores = [waveRiskScore, windRiskScore]
            .filter(v => Number.isFinite(v));

        if (!scores.length) {
            return {
                status: 'UNKNOWN',
                note: 'Insufficient marine/weather data — do not assume safe',
                color: 'grey',
                score: null,
                seaHeight,
                period,
                wind,
                wavePowerProxy
            };
        }

        const finalScore = Math.max(...scores);
        const status = statusFromScore(finalScore);

        return {
            ...status,
            score: finalScore,
            seaHeight,
            period,
            wind,
            wavePowerProxy
        };
    }

    function evaluateSafetyForAssessment(data) {
        if (!isLoadedDateToday()) {
            return evaluateSafetyForDay(data);
        }

        const window = getAssessmentWindow();
        const safety = evaluateSafetyForHour(data, window.startHour);

        return {
            mode: 'hourly',
            ...safety,
            windowLabel: window.label
        };
    }

    // ─── helper assessment ─────────────────────────────────────────────────────────────────

    function getTodayDateString() {
        const now = new Date();

        return [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0')
        ].join('-');
    }

    function getSelectedForecastDate() {
        const dateSelect = document.getElementById('date-select');
        return dateSelect ? dateSelect.value : getTodayDateString();
    }

    function isSelectedDateToday() {
        return getSelectedForecastDate() === getTodayDateString();
    }

    function formatHourRange(hour) {
        const start = String(hour).padStart(2, '0') + ':00';
        const end = String((hour + 1) % 24).padStart(2, '0') + ':00';

        return `${start}–${end}`;
    }

    function safetyStatusFromScore(score) {
        if (score >= 85) {
            return { status: 'EXTREME', color: 'darkred' };
        }

        if (score >= 65) {
            return { status: 'DANGEROUS', color: 'red' };
        }

        if (score >= 45) {
            return { status: 'HIGH RISK', color: 'orange' };
        }

        if (score >= 25) {
            return { status: 'CONDITIONALLY SAFE', color: 'yellow' };
        }

        return { status: 'SAFE', color: 'green' };
    }

    function averageFinite(values) {
        const valid = values.filter((value) => Number.isFinite(value));

        if (!valid.length) {
            return null;
        }

        return valid.reduce((sum, value) => sum + value, 0) / valid.length;
    }
        
    // ─── daily assessment ─────────────────────────────────────────────────────────────────

    function evaluateSafetyForDay(data) {
        const hourlyResults = [];

        for (let hour = 0; hour < 24; hour += 1) {
            const hourlySafety = evaluateSafetyForHour(data, hour);

            if (!hourlySafety || !Number.isFinite(hourlySafety.score)) {
                continue;
            }

            hourlyResults.push({
                hour,
                ...hourlySafety
            });
        }

        if (!hourlyResults.length) {
            return {
                mode: 'daily',
                status: 'UNKNOWN',
                color: 'grey',
                score: null,
                averageScore: null,
                averageStatus: 'UNKNOWN',
                windowLabel: '24h forecast',
                seaHeight: null,
                period: null,
                wind: null,
                peakHourLabel: '—',
                peakStatus: 'UNKNOWN',
                peakScore: null
            };
        }

        const averageScore = Math.round(
            hourlyResults.reduce((sum, item) => sum + item.score, 0) / hourlyResults.length
        );

        const averageStatus = safetyStatusFromScore(averageScore);

        const peakScore = Math.max(...hourlyResults.map((item) => item.score));
        const peakCandidates = hourlyResults.filter((item) => item.score === peakScore);

        /*
        * If multiple hours have the same peak score, choose the hour with the
        * highest sea height, then wind, then period. This avoids always picking
        * 00:00 simply because it appears first in the array.
        */
        const peakHour = peakCandidates.reduce((best, item) => {
            const bestSea = Number.isFinite(best.seaHeight) ? best.seaHeight : -1;
            const itemSea = Number.isFinite(item.seaHeight) ? item.seaHeight : -1;

            if (itemSea !== bestSea) {
                return itemSea > bestSea ? item : best;
            }

            const bestWind = Number.isFinite(best.wind) ? best.wind : -1;
            const itemWind = Number.isFinite(item.wind) ? item.wind : -1;

            if (itemWind !== bestWind) {
                return itemWind > bestWind ? item : best;
            }

            const bestPeriod = Number.isFinite(best.period) ? best.period : -1;
            const itemPeriod = Number.isFinite(item.period) ? item.period : -1;

            return itemPeriod > bestPeriod ? item : best;
        }, peakCandidates[0]);

        const peakStatus = safetyStatusFromScore(peakHour.score);

        return {
            mode: 'daily',

            // Daily headline uses the 24-hour average score.
            status: averageStatus.status,
            color: averageStatus.color,
            score: averageScore,

            averageScore,
            averageStatus: averageStatus.status,

            windowLabel: '24h forecast',

            seaHeight: averageFinite(hourlyResults.map((item) => item.seaHeight)),
            period: averageFinite(hourlyResults.map((item) => item.period)),
            wind: averageFinite(hourlyResults.map((item) => item.wind)),

            peakHourLabel: formatHourRange(peakHour.hour),
            peakStatus: peakStatus.status,
            peakScore: peakHour.score,

            // Backward-compatible aliases.
            worstHourLabel: formatHourRange(peakHour.hour),
            worstStatus: peakStatus.status,
            worstScore: peakHour.score
        };
    }

    function applySafetyColor(color) {
        const colorMap = {
            darkred: '#7f1d1d',
            red: '#ef4444',
            orange: '#f97316',
            yellow: '#eab308',
            green: '#10b981',
            grey: '#94a3b8'
        };

        const resolvedColor = colorMap[color] || colorMap.grey;

        document.querySelectorAll('.status-indicator-dot').forEach(d => {
            d.style.backgroundColor = resolvedColor;
        });

        const statusP = el('safety-status-p');
        if (!statusP) return;

        statusP.className = 'text-base leading-relaxed safety-status-block';
        statusP.style.setProperty('--safety-color', resolvedColor);
    }

    function updateStatusBarFromAssessment(data = lastWeatherData) {
        if (!data) return;

        const statusP = el('safety-status-p');
        if (!statusP) return;

        const safety = evaluateSafetyForAssessment(data);

        const locationName = lastLocationName || resolveLocation().name;
        const dateLabel = lastSelectedDateLabel || formatSelectedDateLabel(el('date-select'));

        let title = 'SAFETY STATUS';
        let detailHTML = '';

        if (safety.mode === 'daily') {
            title = 'DAILY SAFETY FORECAST';

            detailHTML = `
                (<strong>${escapeHTML(locationName)}</strong>
                · ${escapeHTML(dateLabel)}
                · ${escapeHTML(safety.windowLabel)}
                · Avg Risk <strong>${escapeHTML(safety.averageStatus)}</strong>
                · Avg Sea <strong>${formatMetric(safety.seaHeight, 1, 'm')}</strong>
                · Avg Period <strong>${formatMetric(safety.period, 1, 's')}</strong>
                · Avg Wind <strong>${formatMetric(safety.wind, 0, 'km/h')}</strong>
                · Peak <strong>${escapeHTML(safety.peakHourLabel)} ${escapeHTML(safety.peakStatus)}</strong>)
            `;
        }        
        else {
            detailHTML = `
                (<strong>${escapeHTML(locationName)}</strong>
                · ${escapeHTML(dateLabel)}
                · ${escapeHTML(safety.windowLabel)}
                · Sea <strong>${formatMetric(safety.seaHeight, 1, 'm')}</strong>
                · Period <strong>${formatMetric(safety.period, 1, 's')}</strong>
                · Wind <strong>${formatMetric(safety.wind, 0, 'km/h')}</strong>)
            `;
        }

        statusP.innerHTML = `
            <div class="safety-status-title">
                ${title}: <span id="safety-status-strong">${escapeHTML(safety.status)}</span>
            </div>
            <div id="safety-status-note" class="safety-status-detail">
                ${detailHTML}
            </div>
        `;

        applySafetyColor(safety.color);

        if (safety.mode === 'hourly') {
            lastAssessmentHour = getAssessmentWindow().startHour;
        } else {
            lastAssessmentHour = null;
        }
    }

    // ─── Status bar ───────────────────────────────────────────────────────────
    function formatFishBasis(scoreBasis) {
        if (!scoreBasis) return '';

        const solunar = scoreBasis.solunar_period;
        const moon = scoreBasis.moon_phase;
        const light = scoreBasis.sunrise_sunset_overlap;
        const tide = scoreBasis.tide_alignment;

        const parts = [];

        if (Number.isFinite(Number(solunar))) parts.push(`Solunar ${solunar}`);
        if (Number.isFinite(Number(moon))) parts.push(`Moon ${moon}`);
        if (Number.isFinite(Number(light))) parts.push(`Light ${light}`);
        if (Number.isFinite(Number(tide))) parts.push(`Tide ${tide}`);

        return parts.join(' · ');
    }

    function renderFishActivity(data) {
        const fishActivityEl = el('fish-activity-value');
        if (!fishActivityEl) return;

        const activity = data.fish_activity || {};

        const score = Number(activity.score);
        const label = activity.label || '';

        const major = activity.major || data.major || '';
        const minor = activity.minor || data.minor || '';
        const low = activity.low || data.low || data.Low || '';

        const basis = formatFishBasis(activity.score_basis);

        const strikeChance = Number.isFinite(score) && label
            ? `${label} · ${score}/100`
            : '';

        if (!strikeChance && !major && !minor && !low && !basis) {
            fishActivityEl.textContent = '—';
            return;
        }

        fishActivityEl.innerHTML = `
            <div class="fish-activity-list">
                ${strikeChance ? `
                    <div class="fish-activity-row">
                        <span class="fish-activity-label">Strike:</span>
                        <span class="fish-activity-text">${escapeHTML(strikeChance)}</span>
                    </div>
                ` : ''}

                ${major ? `
                    <div class="fish-activity-row">
                        <span class="fish-activity-label">Major:</span>
                        <span class="fish-activity-text">${escapeHTML(major)}</span>
                    </div>
                ` : ''}

                ${minor ? `
                    <div class="fish-activity-row">
                        <span class="fish-activity-label">Minor:</span>
                        <span class="fish-activity-text">${escapeHTML(minor)}</span>
                    </div>
                ` : ''}

                ${low ? `
                    <div class="fish-activity-row fish-activity-low">
                        <span class="fish-activity-label">Low:</span>
                        <span class="fish-activity-text">${escapeHTML(low)}</span>
                    </div>
                ` : ''}

                ${basis ? `
                    <div class="fish-activity-row fish-activity-basis">
                        <span class="fish-activity-label">Basis:</span>
                        <span class="fish-activity-text">${escapeHTML(basis)}</span>
                    </div>
                ` : ''}
            </div>
        `;
    }
    function updateStatusBar(data) {
        updateStatusBarFromAssessment(data);

        const astronomy = data.astronomy || {};

        setText('sunrise-value', astronomy.sunrise || data.sr || '—');
        setText('sunset-value', astronomy.sunset || data.ss || '—');

        renderFishActivity(data);

        if (data.fetched_at) {
            const d = new Date(data.fetched_at);
            const fmt = d.toLocaleString('en-AU', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Australia/Sydney',
                timeZoneName: 'short'
            });

            setText('data-updated-time', fmt);
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
        applySafetyColor('grey');

        const statusP = el('safety-status-p');
        if (statusP) {
            statusP.innerHTML = `
                <div class="safety-status-title">
                    SAFETY STATUS: <span id="safety-status-strong">ERROR</span>
                </div>
                <div id="safety-status-note" class="safety-status-detail">
                    Could not refresh weather data. Do not assume current conditions are safe.
                </div>
            `;
        }

        const banner = el('partial-status-banner');
        if (banner) banner.style.display = 'none';

        const panel = el('ai-analysis-panel');
        if (panel) {
            panel.innerHTML = `<p class="text-sm text-red-500 dark:text-red-400">⚠️ ${escapeHTML(msg)}</p>`;
        }
    }

    // ─── Main fetch ───────────────────────────────────────────────────────────

    let partialRefreshTimer = null;
    let fetchRequestId = 0;

    function clearPartialRefresh() {
        if (partialRefreshTimer) {
            clearTimeout(partialRefreshTimer);
            partialRefreshTimer = null;
        }
    }

    async function fetchWeather() {
        clearPartialRefresh();
        const requestId = ++fetchRequestId;

        const locInput   = el('location-input');
        const dateSelect = el('date-select');
        if (!locInput || !dateSelect) return;

        const loc     = resolveLocation();
        const dateStr = dateSelect.value;
        if (!dateStr) return;

        lastLocationName = loc.name;
        lastSelectedDate = dateStr;
        lastSelectedDateLabel = formatSelectedDateLabel(dateSelect);

        setLoading(true);

        const url = `${API_BASE}?lat=${loc.lat}&lon=${loc.lon}&date=${dateStr}&name=${encodeURIComponent(loc.name)}`;

        try {
            const res  = await fetch(url);
            if (!res.ok) throw new Error(`API error ${res.status}`);
            const data = await res.json();
            
            if (requestId !== fetchRequestId) return;

            document.documentElement.dataset.weatherLoadedDate = dateStr;

            if (window.updateAssessmentTimeline) {
                window.updateAssessmentTimeline();
            }

            lastWeatherData = data;
            lastAssessmentHour = null;

            updateStatusBar(data);
            renderHeightGraph(data);
            renderPeriodGraph(data);
            updateAnalysisPanel(data);

            if (data.status === 'partial') {
                partialRefreshTimer = setTimeout(fetchWeather, 8000);
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

    setInterval(() => {
        if (!lastWeatherData) return;

        // Future-date forecasts use a daily summary, so they do not need
        // minute-by-minute refresh based on the current local hour.
        if (!isLoadedDateToday()) return;

        const { startHour } = getAssessmentWindow();

        if (startHour !== lastAssessmentHour) {
            updateStatusBarFromAssessment(lastWeatherData);
        }
    }, 60 * 1000);
        
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();