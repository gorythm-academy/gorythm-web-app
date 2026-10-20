/**
 * Needs a real MongoDB. Skipped unless TEST_MONGO_URI is set, e.g.
 *   TEST_MONGO_URI=mongodb://127.0.0.1:27017/gorythm_test npm test
 * The database is emptied by this test, so never point it at real data.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

function isolatedTestUri(suffix) {
    const raw = process.env.TEST_MONGO_URI;
    if (!raw) return '';
    const url = new URL(raw);
    const base = url.pathname.replace(/^\//, '').replace(/\/$/, '') || 'gorythm_test';
    url.pathname = `/${base}_${suffix}`;
    return url.toString();
}

const uri = isolatedTestUri('indexes');
const skip = uri ? false : 'TEST_MONGO_URI is not set';

test('unique indexes keep one live enrollment and quiz attempt', { skip }, async (t) => {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    t.after(() => mongoose.disconnect());
    await mongoose.connection.dropDatabase();

    const Enrollment = require('../models/Enrollment');
    const QuizAttempt = require('../models/QuizAttempt');
    const { syncEnrollmentPaymentStatus } = require('../services/enrollmentPaymentSync');
    const { isDuplicateKeyError } = require('../utils/duplicateKey');
    await Promise.all([Enrollment.init(), QuizAttempt.init()]);

    const id = () => new mongoose.Types.ObjectId();
    const student = id();
    const course = id();

    await Enrollment.create({ student, course });
    await assert.rejects(Enrollment.create({ student, course }), isDuplicateKeyError);

    // Different student or different course is fine.
    await Enrollment.create({ student: id(), course });
    await Enrollment.create({ student, course: id() });

    // Placeholder rows (no course) are not limited.
    await Enrollment.create({ student, course: null });
    await Enrollment.create({ student, course: null });

    // A quarantined row does not block a new live one, but cannot be restored next to it.
    const quarantined = await Enrollment.create({ student, course: id() });
    await Enrollment.updateOne({ _id: quarantined._id }, { $set: { deletedAt: new Date() } });
    await Enrollment.create({ student, course: quarantined.course });
    await assert.rejects(
        Enrollment.updateOne({ _id: quarantined._id }, { $set: { deletedAt: null } }),
        isDuplicateKeyError
    );

    // Parallel payment syncs for the same student and course end with exactly one row.
    const payStudent = id();
    const payCourse = id();
    await Promise.all(
        Array.from({ length: 6 }, () =>
            syncEnrollmentPaymentStatus({ userId: payStudent, courseId: payCourse, paymentStatus: 'paid' })
        )
    );
    assert.equal(await Enrollment.countDocuments({ student: payStudent, course: payCourse }), 1);

    // Quiz attempts: one live per student and quiz.
    const quiz = id();
    const attempt = await QuizAttempt.create({ quiz, student });
    await assert.rejects(QuizAttempt.create({ quiz, student }), isDuplicateKeyError);
    await QuizAttempt.updateOne({ _id: attempt._id }, { $set: { deletedAt: new Date() } });
    await QuizAttempt.create({ quiz, student });
    await assert.rejects(
        QuizAttempt.updateOne({ _id: attempt._id }, { $set: { deletedAt: null } }),
        isDuplicateKeyError
    );
});
