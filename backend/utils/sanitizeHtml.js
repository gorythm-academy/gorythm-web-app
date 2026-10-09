const sanitizeHtmlLib = require('sanitize-html');

const OPTIONS = {
    allowedTags: sanitizeHtmlLib.defaults.allowedTags.concat([
        'img',
        'h1',
        'h2',
        'span',
        'div',
        'figure',
        'figcaption',
    ]),
    allowedAttributes: {
        ...sanitizeHtmlLib.defaults.allowedAttributes,
        a: ['href', 'name', 'target', 'rel'],
        img: ['src', 'alt', 'title', 'width', 'height'],
        '*': ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
};

/** Strip dangerous HTML for research / rich text display. */
function sanitizeHtml(html) {
    if (!html) return '';
    return sanitizeHtmlLib(String(html), OPTIONS);
}

module.exports = { sanitizeHtml };
