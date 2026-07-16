/**
 * graph-marker-risk.js
 *
 * Generic risk-colour interpolation for SVG graph markers.
 *
 * Works with:
 * - circles
 * - paths / arrows
 * - rectangles / bars
 * - diamonds or other SVG markers
 *
 * The module does not know anything about a specific graph.
 * Each graph supplies its own min, danger, and maximum values.
 */

(function (global) {
    'use strict';

    const DEFAULT_COLORS = Object.freeze({
        safe: '#22c55e',
        caution: '#eab308',
        warning: '#f97316',
        danger: '#ef4444',
        extreme: '#7f1d1d'
    });


    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }


    function parseHexColor(hexColor) {
        let hex = String(hexColor || '')
            .trim()
            .replace('#', '');

        if (hex.length === 3) {
            hex = hex
                .split('')
                .map((character) => character + character)
                .join('');
        }

        if (!/^[0-9a-f]{6}$/i.test(hex)) {
            return null;
        }

        return {
            red: parseInt(hex.slice(0, 2), 16),
            green: parseInt(hex.slice(2, 4), 16),
            blue: parseInt(hex.slice(4, 6), 16)
        };
    }


    function interpolateColor(startColor, endColor, ratio) {
        const start = parseHexColor(startColor);
        const end = parseHexColor(endColor);

        if (!start || !end) {
            return endColor || startColor;
        }

        const normalizedRatio = clamp(ratio, 0, 1);

        const red = Math.round(
            start.red +
            (end.red - start.red) * normalizedRatio
        );

        const green = Math.round(
            start.green +
            (end.green - start.green) * normalizedRatio
        );

        const blue = Math.round(
            start.blue +
            (end.blue - start.blue) * normalizedRatio
        );

        return `rgb(${red}, ${green}, ${blue})`;
    }


    function normalizeScale(scale) {
        const min = Number(scale?.min);
        const danger = Number(scale?.danger);
        const max = Number(scale?.max);

        if (
            !Number.isFinite(min) ||
            !Number.isFinite(danger) ||
            !Number.isFinite(max) ||
            danger <= min ||
            max <= danger
        ) {
            return null;
        }

        return {
            min,
            danger,
            max,
            colors: {
                ...DEFAULT_COLORS,
                ...(scale.colors || {})
            }
        };
    }


    function buildStops(scale) {
        const normalized = normalizeScale(scale);

        if (!normalized) {
            return [];
        }

        const {
            min,
            danger,
            max,
            colors
        } = normalized;

        const safeRange = danger - min;

        return [
            {
                value: min,
                color: colors.safe
            },
            {
                value: min + safeRange * 0.5,
                color: colors.caution
            },
            {
                value: min + safeRange * 0.8,
                color: colors.warning
            },
            {
                value: danger,
                color: colors.danger
            },
            {
                value: max,
                color: colors.extreme
            }
        ];
    }


    function colorForValue(rawValue, scale) {
        const value = Number(rawValue);
        const stops = buildStops(scale);

        if (!Number.isFinite(value) || !stops.length) {
            return null;
        }

        if (value <= stops[0].value) {
            return stops[0].color;
        }

        for (let index = 1; index < stops.length; index += 1) {
            const previous = stops[index - 1];
            const next = stops[index];

            if (value <= next.value) {
                const range = next.value - previous.value;

                const ratio = range > 0
                    ? (value - previous.value) / range
                    : 1;

                return interpolateColor(
                    previous.color,
                    next.color,
                    ratio
                );
            }
        }

        return stops[stops.length - 1].color;
    }


    function levelForValue(rawValue, scale) {
        const value = Number(rawValue);
        const normalized = normalizeScale(scale);

        if (!Number.isFinite(value) || !normalized) {
            return 'unknown';
        }

        const {
            min,
            danger,
            max
        } = normalized;

        if (value >= max) {
            return 'extreme';
        }

        if (value >= danger) {
            return 'danger';
        }

        const ratio = clamp(
            (value - min) / (danger - min),
            0,
            1
        );

        if (ratio >= 0.8) {
            return 'warning';
        }

        if (ratio >= 0.5) {
            return 'caution';
        }

        return 'safe';
    }


    /**
     * Read graph risk metadata from an SVG element.
     *
     * Expected attributes:
     * data-y-min
     * data-y-max
     * data-danger-value
     */
    function scaleFromSvg(svgElement) {
        if (!svgElement) {
            return null;
        }

        return normalizeScale({
            min: svgElement.dataset.yMin,
            danger: svgElement.dataset.dangerValue,
            max: svgElement.dataset.yMax
        });
    }


    /**
     * Apply risk colour to any SVG element.
     *
     * options.paint:
     * - "fill": recommended for dots and bars
     * - "stroke": recommended for line-only markers
     * - "color": recommended for currentColor-based arrows
     */
    function applyToMarker(
        marker,
        value,
        scale,
        options = {}
    ) {
        if (!marker) {
            return null;
        }

        const color = colorForValue(value, scale);

        if (!color) {
            return null;
        }

        const paint = options.paint || 'fill';

        marker.style.setProperty(paint, color);
        marker.style.setProperty(
            '--marker-risk-color',
            color
        );

        marker.classList.add('risk-colored-marker');

        marker.dataset.riskValue = String(value);
        marker.dataset.riskLevel = levelForValue(
            value,
            scale
        );

        if (options.stroke) {
            marker.setAttribute(
                'stroke',
                options.stroke
            );

            marker.setAttribute(
                'stroke-width',
                String(options.strokeWidth || 1.25)
            );
        }

        return color;
    }


    global.GraphMarkerRisk = Object.freeze({
        colorForValue,
        levelForValue,
        scaleFromSvg,
        applyToMarker
    });

})(window);