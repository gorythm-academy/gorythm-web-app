const test = require('node:test');
const assert = require('node:assert/strict');
const { writeOriginIsForeign, rejectForeignWriteOrigin } = require('../utils/allowedOrigins');

function fakeReq({ method = 'POST', origin, url = '/api/contact' } = {}) {
    const headers = {};
    if (origin !== undefined) headers.origin = origin;
    return {
        method,
        originalUrl: url,
        path: url,
        header: (name) => headers[String(name).toLowerCase()],
    };
}

test('reads and missing origins are allowed', () => {
    assert.equal(writeOriginIsForeign(fakeReq({ method: 'GET', origin: 'https://evil.example' })), false);
    assert.equal(writeOriginIsForeign(fakeReq({ method: 'POST' })), false);
    assert.equal(writeOriginIsForeign(fakeReq({ method: 'OPTIONS', origin: 'https://evil.example' })), false);
});

test('a write from this site is allowed', () => {
    assert.equal(writeOriginIsForeign(fakeReq({ origin: 'https://gorythmacademy.com' })), false);
    assert.equal(writeOriginIsForeign(fakeReq({ origin: 'https://www.gorythmacademy.com' })), false);
    assert.equal(writeOriginIsForeign(fakeReq({ origin: 'http://localhost:3000' })), false);
});

test('a write from another site is blocked, including the Stripe webhook exception', () => {
    assert.equal(writeOriginIsForeign(fakeReq({ origin: 'https://evil.example' })), true);
    assert.equal(writeOriginIsForeign(fakeReq({ origin: 'null' })), true);
    assert.equal(
        writeOriginIsForeign(fakeReq({ origin: 'https://evil.example', url: '/api/payments/webhook' })),
        false
    );
});

test('middleware rejects a foreign write and continues a local one', () => {
    const blocked = fakeReq({ origin: 'https://evil.example' });
    let status = 0;
    let continued = false;
    rejectForeignWriteOrigin(blocked, {
        status(code) {
            status = code;
            return this;
        },
        json() {
            return this;
        },
    }, () => {
        continued = true;
    });
    assert.equal(status, 403);
    assert.equal(continued, false);

    continued = false;
    rejectForeignWriteOrigin(fakeReq({ origin: 'https://gorythmacademy.com' }), {}, () => {
        continued = true;
    });
    assert.equal(continued, true);
});
