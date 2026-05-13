/**
 * Admin dashboard: feature flags and persisted accent theme.
 * Accent overrides --color-accent* inside `.admin-dashboard` only.
 */

export const ADMIN_SETTINGS_PAGE_ENABLED = false;

export const ADMIN_DASHBOARD_ACCENT_STORAGE_KEY = 'gorythm-admin-dashboard-accent';

/** Default matches src/styles/_variables.scss legacy blue */
export const DEFAULT_ADMIN_DASHBOARD_ACCENT = '#3b82f6';

function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
    if (!m) return { r: 59, g: 130, b: 246 };
    return {
        r: parseInt(m[1], 16),
        g: parseInt(m[2], 16),
        b: parseInt(m[3], 16),
    };
}

function rgbChannelToHex(n) {
    const x = Math.max(0, Math.min(255, Math.round(n)));
    return x.toString(16).padStart(2, '0');
}

export function rgbToHex({ r, g, b }) {
    return `#${rgbChannelToHex(r)}${rgbChannelToHex(g)}${rgbChannelToHex(b)}`;
}

function darkenRgb(rgb, factor = 0.82) {
    return {
        r: rgb.r * factor,
        g: rgb.g * factor,
        b: rgb.b * factor,
    };
}

export function readAdminDashboardAccent() {
    try {
        const raw = localStorage.getItem(ADMIN_DASHBOARD_ACCENT_STORAGE_KEY);
        if (raw && /^#[0-9A-Fa-f]{6}$/.test(raw.trim())) return raw.trim();
    } catch (_) {
        /* ignore */
    }
    return null;
}

export const ADMIN_DASHBOARD_ACCENT_CHANGE_EVENT = 'gorythm-admin-dashboard-accent-changed';

export function persistAndNotifyAdminDashboardAccent(hex) {
    const normalized = /^#[0-9A-Fa-f]{6}$/.test(String(hex || '').trim())
        ? hex.trim()
        : DEFAULT_ADMIN_DASHBOARD_ACCENT;
    try {
        localStorage.setItem(ADMIN_DASHBOARD_ACCENT_STORAGE_KEY, normalized);
    } catch (_) {
        /* ignore */
    }
    window.dispatchEvent(
        new CustomEvent(ADMIN_DASHBOARD_ACCENT_CHANGE_EVENT, { detail: { hex: normalized } })
    );
}

/**
 * Inline style object for `.admin-dashboard` root.
 */
export function getAdminDashboardAccentStyleVars(accentHex) {
    const hex = /^#[0-9A-Fa-f]{6}$/.test(String(accentHex || '').trim())
        ? accentHex.trim()
        : DEFAULT_ADMIN_DASHBOARD_ACCENT;
    const rgb = hexToRgb(hex);
    const dark = darkenRgb(rgb, 0.82);
    const darkHex = rgbToHex(dark);
    const rgbStr = `${rgb.r},${rgb.g},${rgb.b}`;
    const darkRgbStr = `${Math.round(dark.r)},${Math.round(dark.g)},${Math.round(dark.b)}`;
    return {
        '--color-accent': hex,
        '--color-accent-rgb': rgbStr,
        '--color-accent-dark': darkHex,
        '--color-accent-dark-rgb': darkRgbStr,
    };
}
