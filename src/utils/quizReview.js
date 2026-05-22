/** Build per-question review after submit (student or teacher view). */
export function buildQuizReview(questions, studentAnswers, totalMarks) {
  const qs = questions || [];
  const total = qs.length;
  let correctCount = 0;
  const items = qs.map((q, idx) => {
    const chosen = studentAnswers[idx] != null ? Number(studentAnswers[idx]) : -1;
    const correctIdx = Number(q.correctAnswer) ?? 0;
    const isCorrect = chosen === correctIdx;
    if (isCorrect) correctCount += 1;
    const options = (q.options || []).slice(0, 3);
    return {
      question: q.question,
      options,
      correctIndex: correctIdx,
      chosenIndex: chosen,
      isCorrect,
    };
  });
  const score =
    totalMarks != null && totalMarks > 0 && total
      ? Math.round((correctCount / total) * totalMarks)
      : correctCount;
  return {
    items,
    correctCount,
    totalQuestions: total,
    score,
    scoreDisplay:
      totalMarks != null && totalMarks > 0 ? `${score} / ${totalMarks}` : String(score),
  };
}
