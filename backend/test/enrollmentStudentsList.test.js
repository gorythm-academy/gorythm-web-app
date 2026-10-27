const test = require('node:test');
const assert = require('node:assert/strict');
const { statusAndFeeConstraints } = require('../utils/enrollmentStudentsList');

test('active, paused, and completed each match that enrollment status', () => {
    assert.deepEqual(statusAndFeeConstraints('active', 'all'), { status: 'active' });
    assert.deepEqual(statusAndFeeConstraints('paused', 'all'), { status: 'paused' });
    assert.deepEqual(statusAndFeeConstraints('completed', 'all'), { status: 'completed' });
});

test('inactive also includes legacy pending and blank rows', () => {
    assert.deepEqual(statusAndFeeConstraints('inactive', 'all'), {
        status: { $in: ['inactive', 'pending', null] },
    });
});

test('all status adds no enrollment constraint', () => {
    assert.deepEqual(statusAndFeeConstraints('all', 'all'), {});
    assert.deepEqual(statusAndFeeConstraints('', ''), {});
});

test('fee status is applied together with enrollment status', () => {
    assert.deepEqual(statusAndFeeConstraints('active', 'paid'), {
        status: 'active',
        paymentStatus: 'paid',
    });
    assert.deepEqual(statusAndFeeConstraints('all', 'pending'), {
        paymentStatus: { $in: ['pending', null] },
    });
});
