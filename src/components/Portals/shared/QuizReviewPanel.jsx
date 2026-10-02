import React from 'react';
import './QuizReviewPanel.scss';

const LABELS = ['A', 'B', 'C'];

export default function QuizReviewPanel({ review, title, chosenLabel = 'Your answer', compact = false }) {
  if (!review?.items?.length) {
    return <p className="portal-empty">No review data.</p>;
  }

  return (
    <div className={`portal-quiz-review${compact ? ' portal-quiz-review--compact' : ''}`}>
      {title ? <h3 className="portal-quiz-review-title">{title}</h3> : null}
      <p className="portal-quiz-review-score">
        <span className="portal-quiz-review-score__pill">
          <i className="fas fa-star" aria-hidden />
          Score {review.scoreDisplay}
        </span>
        {review.totalQuestions ? (
          <span className="portal-quiz-review-meta">
            {review.correctCount} of {review.totalQuestions} correct
          </span>
        ) : null}
      </p>
      {review.items.map((item, idx) => (
        <div key={idx} className="portal-quiz-review-question">
          <p className="portal-quiz-review-qtext">
            <span className="portal-quiz-review-num">{idx + 1}</span>
            {item.question}
            {item.chosenIndex < 0 ? (
              <span className="portal-quiz-review-tag portal-quiz-review-tag--wrong"> Not answered</span>
            ) : null}
          </p>
          <ul className="portal-quiz-review-options">
            {(item.options || []).map((opt, oi) => {
              const isCorrect = oi === item.correctIndex;
              const isChosen = oi === item.chosenIndex;
              let className = 'portal-quiz-review-option';
              if (isCorrect) className += ' portal-quiz-review-option--correct';
              if (isChosen && !isCorrect) className += ' portal-quiz-review-option--wrong';
              if (isChosen && isCorrect) className += ' portal-quiz-review-option--chosen-correct';
              return (
                <li key={oi} className={className}>
                  <span className="portal-quiz-review-letter">{LABELS[oi] || oi + 1}</span>
                  <span className="portal-quiz-review-option-text">{opt || '—'}</span>
                  {isChosen ? <span className="portal-quiz-review-tag">{chosenLabel}</span> : null}
                  {isCorrect ? <span className="portal-quiz-review-tag portal-quiz-review-tag--right">Correct</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
