const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isDueDatePast, dueDateStillOpenClause } = require('../utils/lmsContentRules');
const { startOfAcademyDay } = require('../utils/academyCalendar');
const { resolveStoredFilename } = require('../utils/safeFilename');

test('a quiz stays open on its Pakistan due date and closes the next Pakistan day', () => {
    const due = new Date('2026-10-26T00:00:00.000Z');
    assert.equal(isDueDatePast(due, new Date('2026-10-26T18:00:00.000Z')), false);
    assert.equal(isDueDatePast(due, new Date('2026-10-26T21:00:00.000Z')), true);
    assert.equal(isDueDatePast(null, new Date('2026-10-27T00:00:00.000Z')), false);
});

test('open quizzes include undated work and dates from the Pakistan day onward', () => {
    const today = new Date('2026-10-26T18:00:00.000Z');
    const clause = dueDateStillOpenClause(today);
    assert.deepEqual(clause.$or[0], { dueDate: null });
    assert.deepEqual(clause.$or[1], { dueDate: { $exists: false } });
    assert.equal(clause.$or[2].dueDate.$gte.getTime(), startOfAcademyDay(today).getTime());
});

test('a repeated payment proof name is stored with a suffix', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gorythm-proof-'));
    try {
        fs.writeFileSync(path.join(dir, 'receipt.pdf'), 'a');
        const name = resolveStoredFilename({
            destDir: dir,
            originalName: 'receipt.pdf',
            onDuplicate: 'suffix',
        });
        assert.equal(name, 'receipt (2).pdf');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('a proof file shared by another payment is not deleted', async () => {
    const Payment = require('../models/Payment');
    const original = Payment.countDocuments;
    Payment.countDocuments = async (query) => {
        assert.equal(query.proofUrl, '/api/uploads/payment-proofs/receipt.pdf');
        assert.ok(Array.isArray(query._id.$nin));
        return 1;
    };
    try {
        const { deleteProofFileIfLastReference } = require('../services/trashCleanup');
        const result = await deleteProofFileIfLastReference(
            '/api/uploads/payment-proofs/receipt.pdf',
            ['507f1f77bcf86cd799439011']
        );
        assert.deepEqual(result, { ok: true, reason: 'shared' });
    } finally {
        Payment.countDocuments = original;
    }
});
