const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-csrf-guard';

const authMiddleware = require('../middleware/auth');
const { cookieRequestIsForged, ADMIN_COOKIE, PORTAL_COOKIE } = require('../utils/authCookies');
const { currentAuthEpoch } = require('../utils/tokenEpoch');

function fakeReq({ method = 'GET', headers = {}, cookies = {}, url = '/api/portal/student/profile' } = {}) {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return {
        method,
        cookies,
        originalUrl: url,
        path: url,
        header: (name) => lower[String(name).toLowerCase()],
    };
}

function runMiddleware(req) {
    return new Promise((resolve) => {
        const res = {
            statusCode: 200,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(body) {
                resolve({ status: this.statusCode, body });
            },
        };
        authMiddleware(req, res, () => resolve({ status: 200, user: req.user }));
    });
}

test('reads are never treated as forged', () => {
    assert.equal(cookieRequestIsForged(fakeReq({ method: 'GET' })), false);
    assert.equal(cookieRequestIsForged(fakeReq({ method: 'HEAD' })), false);
});

test('a cookie-only change request must carry the realm header', () => {
    assert.equal(cookieRequestIsForged(fakeReq({ method: 'POST' })), true);
    assert.equal(cookieRequestIsForged(fakeReq({ method: 'DELETE', headers: { 'X-Auth-Realm': 'other' } })), true);
    assert.equal(cookieRequestIsForged(fakeReq({ method: 'POST', headers: { 'X-Auth-Realm': 'portal' } })), false);
    assert.equal(cookieRequestIsForged(fakeReq({ method: 'PATCH', headers: { 'X-Auth-Realm': 'admin' } })), false);
});

test('a real Bearer token is not a cookie session', () => {
    assert.equal(cookieRequestIsForged(fakeReq({ method: 'POST', headers: { Authorization: 'Bearer abc.def.ghi' } })), false);
    // The sentinel is not a credential.
    assert.equal(cookieRequestIsForged(fakeReq({ method: 'POST', headers: { Authorization: 'Bearer __cookie_session__' } })), true);
});

test('auth middleware blocks a forged cookie request and allows a normal one', async () => {
    const token = jwt.sign(
        { userId: 'u1', role: 'student', authEpoch: currentAuthEpoch() },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
    const forged = await runMiddleware(fakeReq({ method: 'POST', cookies: { [PORTAL_COOKIE]: token } }));
    assert.equal(forged.status, 403);

    const normal = await runMiddleware(
        fakeReq({ method: 'POST', cookies: { [PORTAL_COOKIE]: token }, headers: { 'X-Auth-Realm': 'portal' } })
    );
    assert.equal(normal.status, 200);
    assert.equal(normal.user.userId, 'u1');

    const read = await runMiddleware(fakeReq({ method: 'GET', cookies: { [PORTAL_COOKIE]: token } }));
    assert.equal(read.status, 200);
});

test('no cookie and no token still ends in 401', async () => {
    const result = await runMiddleware(fakeReq({ method: 'POST', headers: { 'X-Auth-Realm': 'admin' } }));
    assert.equal(result.status, 401);
    assert.ok(ADMIN_COOKIE);
});
