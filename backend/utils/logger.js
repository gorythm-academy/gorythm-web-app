/**
 * Small structured logger: JSON lines in production (default), human-readable locally.
 * Set LOG_FORMAT=json|pretty to override. DEBUG=1 enables debug logs in production.
 */
const SERVICE = 'gorythm-api';

function useJsonLogs() {
    if (process.env.LOG_FORMAT === 'json') return true;
    if (process.env.LOG_FORMAT === 'pretty') return false;
    return process.env.NODE_ENV === 'production';
}

function serializeMeta(meta) {
    if (meta == null) return {};
    if (typeof meta !== 'object') return { value: meta };
    const out = { ...meta };
    for (const key of ['err', 'error']) {
        if (out[key] instanceof Error) {
            out.errorMessage = out[key].message;
            if (!useJsonLogs()) out.errorStack = out[key].stack;
            delete out[key];
        }
    }
    return out;
}

function write(level, message, meta = {}) {
    const payload = {
        ts: new Date().toISOString(),
        level,
        service: SERVICE,
        msg: message,
        ...serializeMeta(meta),
    };

    if (useJsonLogs()) {
        const line = JSON.stringify(payload);
        if (level === 'error') console.error(line);
        else if (level === 'warn') console.warn(line);
        else console.log(line);
        return;
    }

    const { ts, level: lv, service, msg, ...rest } = payload;
    const suffix = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
    const line = `[${ts}] ${String(lv).toUpperCase()} [${service}] ${msg}${suffix}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
}

module.exports = {
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
    debug: (message, meta) => {
        if (process.env.NODE_ENV !== 'production' || process.env.DEBUG === '1') {
            write('debug', message, meta);
        }
    },
};
