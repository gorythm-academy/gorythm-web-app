import React from 'react';
import { createPortal } from 'react-dom';
import { absFileUrl, uploadDisplayName } from '../../../utils/fileUrl';
import { useDialogKeyboard } from '../../../hooks/useDialogKeyboard';
import QuizReviewPanel from './QuizReviewPanel';
import './QuizPreviewModal.scss';

export function quizMaterialFiles(quiz) {
  const files = Array.isArray(quiz?.attachments) ? quiz.attachments.filter(Boolean) : [];
  if (quiz?.resourceFileUrl && !files.includes(quiz.resourceFileUrl)) files.unshift(quiz.resourceFileUrl);
  return files;
}

function fileKind(url) {
  const name = String(url || '').toLowerCase();
  if (name.endsWith('.pdf')) return { icon: 'fa-file-pdf', label: 'PDF' };
  if (/\.(png|jpe?g|webp|gif)$/.test(name)) return { icon: 'fa-file-image', label: 'Image' };
  if (/\.(doc|docx)$/.test(name)) return { icon: 'fa-file-word', label: 'Document' };
  return { icon: 'fa-file-lines', label: 'File' };
}

export function QuizFileView({ quiz, tone = 'teacher', compact = false }) {
  const files = quizMaterialFiles(quiz);
  const link = String(quiz?.resourceLink || '').trim();
  return (
    <div className={`quiz-file-view quiz-file-view--${tone}`}>
      {compact ? null : (
        <div className="quiz-file-view__hero">
          <span className="quiz-file-view__icon" aria-hidden>
            <i className="fas fa-book-open" />
          </span>
          <div>
            <p className="quiz-file-view__kicker">File / Reading quiz</p>
            <h3>{quiz?.title || 'Quiz'}</h3>
            <p>
              {quiz?.course?.title ? quiz.course.title : 'Course quiz'}
              {quiz?.dueDate ? ` · Due ${new Date(quiz.dueDate).toLocaleDateString()}` : ''}
            </p>
          </div>
        </div>
      )}
      {!link && !files.length ? (
        <p className="quiz-file-view__empty">No reading link or files were added to this quiz.</p>
      ) : null}
      {link ? (
        <a className="quiz-file-view__link" href={link} target="_blank" rel="noreferrer">
          <span className="quiz-file-view__file-icon" aria-hidden>
            <i className="fas fa-link" />
          </span>
          <span>
            <strong>Reading link</strong>
            <small>{link}</small>
          </span>
          <em>Open</em>
        </a>
      ) : null}
      {files.length ? (
        <ul className="quiz-file-view__files">
          {files.map((url) => {
            const kind = fileKind(url);
            return (
              <li key={url}>
                <a href={absFileUrl(url)} target="_blank" rel="noreferrer">
                  <span className="quiz-file-view__file-icon" aria-hidden>
                    <i className={`fas ${kind.icon}`} />
                  </span>
                  <span>
                    <strong>{uploadDisplayName(url)}</strong>
                    <small>{kind.label}</small>
                  </span>
                  <em>Open</em>
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export default function QuizPreviewModal({
  quiz,
  onClose,
  tone = 'admin',
  showCorrect = false,
  review = null,
  attempt = null,
  heading = null,
  kicker = null,
  chosenLabel = 'Your answer',
}) {
  useDialogKeyboard({ isOpen: Boolean(quiz), onClose });
  if (!quiz) return null;
  const isFile = quiz.quizType === 'file';
  const questions = quiz.questions || [];
  const attemptFiles = Array.isArray(attempt?.attachments) ? attempt.attachments.filter(Boolean) : [];
  const isAttemptView = Boolean(review || attempt);

  return createPortal(
    <div className="quiz-preview-backdrop" onClick={onClose} role="presentation">
      <div
        className={`quiz-preview quiz-preview--${tone}${isAttemptView ? ' quiz-preview--attempt' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quiz-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="quiz-preview__header">
          <div>
            <p className="quiz-preview__kicker">
              {kicker
                || (isAttemptView
                  ? isFile
                    ? 'Student submission'
                    : 'Answer review'
                  : isFile
                    ? 'File / Reading quiz'
                    : 'MCQ quiz')}
            </p>
            <h3 id="quiz-preview-title">{heading || quiz.title || 'Quiz'}</h3>
          </div>
          <button type="button" className="quiz-preview__close" onClick={onClose} aria-label="Close">
            <i className="fas fa-times" />
          </button>
        </header>

        <dl className="quiz-preview__meta">
          <div>
            <dt>Course</dt>
            <dd>{quiz.course?.title || '—'}</dd>
          </div>
          {tone !== 'student' && tone !== 'parent' && quiz.teacher?.name ? (
            <div>
              <dt>Teacher</dt>
              <dd>{quiz.teacher.name}</dd>
            </div>
          ) : null}
          {attempt?.student?.name ? (
            <div>
              <dt>Student</dt>
              <dd>{attempt.student.name}</dd>
            </div>
          ) : null}
          <div>
            <dt>Due date</dt>
            <dd>{quiz.dueDate ? new Date(quiz.dueDate).toLocaleDateString() : 'No due date'}</dd>
          </div>
          {review?.scoreDisplay ? (
            <div>
              <dt>Score</dt>
              <dd>{review.scoreDisplay}</dd>
            </div>
          ) : !isFile ? (
            <div>
              <dt>Questions</dt>
              <dd>{questions.length}</dd>
            </div>
          ) : null}
        </dl>

        <div className="quiz-preview__body">
          {isFile ? (
            <>
              <QuizFileView quiz={quiz} tone={tone} compact />
              {attemptFiles.length ? (
                <div className="quiz-preview__attempt-files">
                  <h4>Submitted files</h4>
                  <QuizFileView
                    quiz={{ title: 'Submitted files', attachments: attemptFiles, quizType: 'file' }}
                    tone={tone}
                    compact
                  />
                </div>
              ) : null}
            </>
          ) : review?.items?.length ? (
            <QuizReviewPanel review={review} chosenLabel={chosenLabel} compact />
          ) : (
            <ol className="quiz-preview__questions">
              {questions.map((question, index) => (
                <li key={index}>
                  <p>{question.question}</p>
                  <ul>
                    {(question.options || []).slice(0, 3).map((option, optionIndex) => {
                      const correct = showCorrect && Number(question.correctAnswer) === optionIndex;
                      return (
                        <li key={optionIndex} className={correct ? 'is-correct' : ''}>
                          <span>{['A', 'B', 'C'][optionIndex]}</span>
                          {option || '—'}
                          {correct ? <em>Correct</em> : null}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>

        <footer className="quiz-preview__footer">
          <button type="button" className={`quiz-preview__dismiss quiz-preview__dismiss--${tone}`} onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
