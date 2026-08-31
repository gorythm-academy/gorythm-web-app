import React from 'react';
import { getEnrollmentStatusIcon } from '../../../../utils/studentAdminValidation';
import { portalEmailDisplayLabel } from '../../../../utils/studentPortalEmail';

const StudentCard = ({ card, onOpen }) => {
    const statusKey = String(card.statusLabel || 'active').toLowerCase();
    const feeKey = String(card.feeStatusLabel || 'pending').toLowerCase();
    return (
        <button
            type="button"
            className={`student-card${card.pendingSetup ? ' student-card--pending-setup' : ''}`}
            onClick={() => onOpen(card)}
        >
            <div className="student-card__header">
                <div className="student-card__avatar" aria-hidden>
                    {(card.student.name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="student-card__identity">
                    <div className="student-card__name-row">
                        <strong className="student-card__name">
                            {card.student.name || 'Unknown Student'}
                        </strong>
                        {card.student.studentId ? (
                            <span className="student-id-cell">{card.student.studentId}</span>
                        ) : (
                            <span className="student-id-cell no-id">—</span>
                        )}
                    </div>
                    <span className="student-card__email">
                        <span className="student-card__email-label">Portal</span>
                        <span className="student-card__email-value">
                            {portalEmailDisplayLabel(card.student.email)}
                        </span>
                    </span>
                </div>
            </div>

            <div className="student-card__courses">
                <span className="student-card__section-label">
                    {card.courseCount > 0
                        ? `${card.courseCount} course${card.courseCount === 1 ? '' : 's'}`
                        : 'Courses'}
                </span>
                <span className="student-card__courses-text" title={card.courseSummary}>
                    {card.courseSummary}
                </span>
            </div>

            <div className="student-card__status">
                <div className="student-card__status-pair">
                    <span className="student-card__section-label">Status</span>
                    <span className={`student-card__status-value is-${statusKey}`}>
                        <i
                            className={`fas fa-${getEnrollmentStatusIcon(statusKey === 'mixed' ? 'active' : statusKey)}`}
                            aria-hidden
                        />
                        {card.statusLabel}
                    </span>
                </div>
                <div className="student-card__status-pair">
                    <span className="student-card__section-label">Fee</span>
                    <span className={`student-card__status-value is-fee-${feeKey}`}>
                        {card.feeStatusLabel}
                    </span>
                </div>
                {card.pendingSetup ? (
                    <span className="student-card__setup-flag">Pending setup</span>
                ) : null}
            </div>

            <div className="student-card__footer">
                <span className="student-card__enrollments">
                    {card.enrollmentCount} enrollment{card.enrollmentCount === 1 ? '' : 's'}
                </span>
                <span className="student-card__cta">
                    View courses <i className="fas fa-arrow-right" aria-hidden />
                </span>
            </div>
        </button>
    );
};

export default StudentCard;
