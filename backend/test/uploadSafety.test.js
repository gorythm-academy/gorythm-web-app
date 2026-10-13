const test = require('node:test');
const assert = require('node:assert/strict');
const { bufferMatchesMime } = require('../utils/fileSignature');
const { escapeRegex } = require('../utils/escapeRegex');
const { publicErrorText } = require('../utils/publicError');

test('file signatures must match the declared type', () => {
    const pdf = Buffer.from('%PDF-1.7 rest');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBP')]);
    assert.equal(bufferMatchesMime(pdf, 'application/pdf'), true);
    assert.equal(bufferMatchesMime(png, 'image/png'), true);
    assert.equal(bufferMatchesMime(jpg, 'image/jpeg'), true);
    assert.equal(bufferMatchesMime(webp, 'image/webp'), true);
    assert.equal(bufferMatchesMime(Buffer.from('<?php echo 1;'), 'application/pdf'), false);
    assert.equal(bufferMatchesMime(Buffer.from('<script>'), 'image/png'), false);
    assert.equal(bufferMatchesMime(pdf, 'image/png'), false);
    assert.equal(bufferMatchesMime(pdf, 'text/html'), false);
    assert.equal(bufferMatchesMime(Buffer.alloc(0), 'application/pdf'), false);
});

test('search text is escaped before it becomes a regex', () => {
    assert.equal(escapeRegex('a.b*c(d)'), 'a\\.b\\*c\\(d\\)');
    const re = new RegExp(escapeRegex('(a+)+$'), 'i');
    assert.equal(re.test('aaaaaaaaaaaaaaaaaaaaaaaa!'), false);
    assert.equal(re.test('x (a+)+$ y'), true);
});

test('only people-facing errors are shown in responses', () => {
    const validation = Object.assign(new Error('Name is required'), { name: 'ValidationError' });
    assert.equal(publicErrorText(validation), 'Name is required');
    assert.equal(publicErrorText(new Error('E11000 duplicate key collection: x')), undefined);
});
