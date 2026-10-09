const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeHtml } = require('../utils/sanitizeHtml');

test('keeps ordinary article markup', () => {
    const clean = sanitizeHtml('<h2>Title</h2><p>Hello <strong>there</strong></p>');
    assert.match(clean, /<h2>Title<\/h2>/);
    assert.match(clean, /<strong>there<\/strong>/);
});

test('removes script and event handlers', () => {
    const clean = sanitizeHtml('<p>Hi</p><script>alert(1)</script><img src="x" onerror="alert(1)"><svg/onload=alert(1)>');
    assert.equal(clean.includes('script'), false);
    assert.equal(clean.includes('onerror'), false);
    assert.equal(clean.includes('onload'), false);
    assert.match(clean, /<p>Hi<\/p>/);
});
