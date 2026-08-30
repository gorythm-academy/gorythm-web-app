const test = require('node:test');
const assert = require('node:assert/strict');
const { buildQuizReviewPayload, formatScoreDisplay } = require('../utils/quizReview');

test('uses chosenIndex expected by the shared review UI', () => {
    const review = buildQuizReviewPayload(
        {
            totalMarks: 10,
            questions: [
                { question: 'First?', options: ['A', 'B', 'C'], correctAnswer: 1 },
                { question: 'Second?', options: ['A', 'B', 'C'], correctAnswer: 2 },
            ],
        },
        [1]
    );

    assert.equal(review.items[0].chosenIndex, 1);
    assert.equal(review.items[0].isCorrect, true);
    assert.equal(review.items[1].chosenIndex, -1);
    assert.equal('pickedIndex' in review.items[0], false);
    assert.equal(review.correctCount, 1);
    assert.equal(review.scoreDisplay, '5 / 10');
});

test('keeps quiz options in the supported A/B/C format', () => {
    const review = buildQuizReviewPayload(
        {
            questions: [
                { question: 'Choose', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
            ],
        },
        [0]
    );

    assert.deepEqual(review.items[0].options, ['A', 'B', 'C']);
});

test('formats scores without changing existing display semantics', () => {
    assert.equal(formatScoreDisplay(null, 10), '—');
    assert.equal(formatScoreDisplay(7, 10), '7 / 10');
    assert.equal(formatScoreDisplay(2, null), '2');
});
