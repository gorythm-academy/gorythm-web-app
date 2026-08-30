function formatScoreDisplay(score, maxPoints) {
    if (score == null) return '—';
    if (maxPoints != null && maxPoints > 0) return `${score} / ${maxPoints}`;
    return String(score);
}

/**
 * Build the server-authoritative quiz review payload consumed by QuizReviewPanel.
 * Questions are normalized to the supported A/B/C option format.
 */
function buildQuizReviewPayload(quiz, answers = []) {
    const questions = quiz?.questions || [];
    const total = questions.length;
    let correctCount = 0;

    const items = questions.map((question, index) => {
        const chosenIndex = answers[index] != null ? Number(answers[index]) : -1;
        const rawCorrectIndex = Number(question.correctAnswer);
        const correctIndex = Number.isFinite(rawCorrectIndex) ? rawCorrectIndex : 0;
        const isCorrect = chosenIndex === correctIndex;
        if (isCorrect) correctCount += 1;

        return {
            question: question.question,
            options: (question.options || []).slice(0, 3),
            correctIndex,
            chosenIndex,
            isCorrect,
        };
    });

    const normalizedScore =
        quiz?.totalMarks != null && quiz.totalMarks > 0 && total
            ? Math.round((correctCount / total) * quiz.totalMarks)
            : correctCount;

    return {
        items,
        correctCount,
        totalQuestions: total,
        score: normalizedScore,
        scoreDisplay: formatScoreDisplay(normalizedScore, quiz?.totalMarks),
    };
}

module.exports = { buildQuizReviewPayload, formatScoreDisplay };
