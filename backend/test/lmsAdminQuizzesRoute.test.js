const test = require('node:test');
const assert = require('node:assert/strict');

function collectRoutes(router, routes) {
    for (const layer of router.stack || []) {
        if (layer.route) {
            for (const method of Object.keys(layer.route.methods)) {
                if (layer.route.methods[method]) {
                    routes.push(`${method.toUpperCase()} ${layer.route.path}`);
                }
            }
        } else if (layer.name === 'router' && layer.handle?.stack) {
            collectRoutes(layer.handle, routes);
        }
    }
}

test('GET /api/lms-admin/quizzes is registered', () => {
    const router = require('../routes/lmsAdmin');
    const routes = [];
    collectRoutes(router, routes);
    assert.ok(
        routes.includes('GET /quizzes'),
        'GET /api/lms-admin/quizzes must be mounted on the LMS admin router'
    );
});
