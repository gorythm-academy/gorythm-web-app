/** Strip dangerous HTML for research / rich text display. */
function sanitizeHtml(html) {
    if (!html) return '';
    let out = String(html);
    out = out.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    out = out.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
    out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    out = out.replace(/javascript:/gi, '');
    return out;
}

module.exports = { sanitizeHtml };
