import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { portalEmailDisplayLabel } from '../../../utils/studentPortalEmail';
import { normalizeEnrollmentStatus } from '../../../utils/studentAdminValidation';
import { useDialogKeyboard } from '../../../hooks/useDialogKeyboard';
import {
    ACTIVE_RECORDS_LABEL,
    QUARANTINE_COURSES_LABEL,
} from '../../../utils/adminListLabels';
import { formatScheduleTimeLabel } from '../../../utils/formatScheduleLabel';

const getAllottedTeacherName = (enrollment) =>
    enrollment?.assignedSchedule?.teacher?.name || '';

const formatDateOnly = (rawDate) => {
    if (!rawDate) return 'Not set';
    return new Date(rawDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
};

const formatDateTime = (rawDate) => {
    if (!rawDate) return '—';
    return new Date(rawDate).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};

const formatParentsLabel = (parents = []) => {
    if (!parents.length) return '—';
    return parents
        .map((p) => {
            const name = p.name || 'Parent';
            return p.relation ? `${name} (${p.relation})` : name;
        })
        .join(', ');
};

const courseTabKey = (enrollment) => String(enrollment?._id || '');

/** Prefer populated student object; never treat raw ObjectId as the student record. */
const resolveRowStudent = (enrollment, overlayStudent) => {
    const raw = enrollment?.student;
    if (raw && typeof raw === 'object' && (raw.name || raw.email || raw.studentId || raw._id)) {
        return {
            ...overlayStudent,
            ...raw,
            name: raw.name || overlayStudent?.name,
            studentId: raw.studentId || overlayStudent?.studentId,
            email: raw.email || overlayStudent?.email,
            personalEmail: raw.personalEmail || overlayStudent?.personalEmail,
            phone: raw.phone || overlayStudent?.phone,
            lastLogin: raw.lastLogin || overlayStudent?.lastLogin,
            parents: overlayStudent?.parents || raw.parents || [],
        };
    }
    return overlayStudent || {};
};

const COLUMN_KEYS = [
    'checkbox',
    'studentId',
    'student',
    'parent',
    'personalEmail',
    'phone',
    'course',
    'teachers',
    'enrollmentDate',
    'added',
    'lastLogin',
    'fee',
    'status',
    'actions',
];

const COLUMN_WIDTHS = [44, 120, 180, 140, 150, 110, 180, 120, 120, 120, 140, 100, 110, 160];
const COLUMN_MINS = [40, 90, 140, 110, 120, 90, 140, 90, 100, 100, 110, 80, 90, 130];
const COLUMN_MAXS = [60, 220, 320, 260, 280, 180, 360, 220, 200, 200, 240, 160, 180, 240];
const COLUMN_LABELS = {
    checkbox: '',
    studentId: 'Student ID',
    student: 'Student',
    parent: 'Parent',
    personalEmail: 'Personal email',
    phone: 'Phone',
    course: 'Course',
    teachers: 'Teacher(s)',
    enrollmentDate: 'Enrollment Date',
    added: 'Added',
    lastLogin: 'Last Login',
    fee: 'Fee status',
    status: 'Status',
    actions: 'Actions',
};

const SORTABLE_COLUMNS = new Set([
    'studentId',
    'student',
    'parent',
    'personalEmail',
    'phone',
    'course',
    'teachers',
    'enrollmentDate',
    'added',
    'lastLogin',
    'fee',
    'status',
]);

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const getSortValue = (enrollment, student, key) => {
    const rowStudent = resolveRowStudent(enrollment, student);
    switch (key) {
        case 'studentId':
            return String(rowStudent.studentId || '').toLowerCase();
        case 'student':
            return String(rowStudent.name || '').toLowerCase();
        case 'parent':
            return formatParentsLabel(rowStudent.parents || student?.parents || []).toLowerCase();
        case 'personalEmail':
            return String(rowStudent.personalEmail || '').toLowerCase();
        case 'phone':
            return String(rowStudent.phone || '').toLowerCase();
        case 'course':
            return String(enrollment.course?.title || '').toLowerCase();
        case 'teachers':
            return String(getAllottedTeacherName(enrollment) || '').toLowerCase();
        case 'enrollmentDate':
            return enrollment.enrollmentDate ? new Date(enrollment.enrollmentDate).getTime() : 0;
        case 'added':
            return rowStudent.createdAt ? new Date(rowStudent.createdAt).getTime() : 0;
        case 'lastLogin':
            return rowStudent.lastLogin ? new Date(rowStudent.lastLogin).getTime() : 0;
        case 'fee':
            return String(enrollment.paymentStatus || 'pending').toLowerCase();
        case 'status':
            return normalizeEnrollmentStatus(enrollment.status);
        default:
            return '';
    }
};

/**
 * Full-area overlay: one student’s enrollments with checkbox selection,
 * Actions column, and resizable columns (matches other admin tabs).
 */
const StudentDetailOverlay = ({
    student,
    detailTab,
    onDetailTabChange,
    enrollments,
    loading,
    refreshing = false,
    trashBusy,
    quarantineCount = 0,
    studentQuarantined = false,
    onClose,
    onAddCourse,
    onEditEnrollment,
    onQuarantineEnrollment,
    onQuarantineStudent,
    onRestoreStudent,
    onPermanentDeleteStudent,
    onRestoreEnrollment,
    onPermanentDelete,
    onUpdateStatus,
    blockEscape = false,
}) => {
    const [courseFilterId, setCourseFilterId] = useState('all');
    const [selectedIds, setSelectedIds] = useState([]);
    const [columnWidths, setColumnWidths] = useState(COLUMN_WIDTHS);
    const [sortBy, setSortBy] = useState('enrollmentDate');
    const [sortOrder, setSortOrder] = useState('desc');
    const tableContainerRef = useRef(null);
    const dragStateRef = useRef({ isDragging: false, startX: 0, startScrollLeft: 0 });
    const [isTableDragging, setIsTableDragging] = useState(false);

    useDialogKeyboard({
        isOpen: Boolean(student),
        onClose,
        blockEscape,
    });

    useEffect(() => {
        if (!student) return undefined;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev || '';
        };
    }, [student]);

    const startTableDragScroll = (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('button, input, select, textarea, a, .col-resizer')) return;

        const tableContainer = tableContainerRef.current;
        if (!tableContainer) return;

        dragStateRef.current = {
            isDragging: true,
            startX: e.clientX,
            startScrollLeft: tableContainer.scrollLeft,
        };
        setIsTableDragging(true);
    };

    const onTableDragScroll = (e) => {
        const tableContainer = tableContainerRef.current;
        const dragState = dragStateRef.current;
        if (!tableContainer || !dragState.isDragging) return;

        const deltaX = e.clientX - dragState.startX;
        tableContainer.scrollLeft = dragState.startScrollLeft - deltaX;
    };

    const stopTableDragScroll = () => {
        if (!dragStateRef.current.isDragging) return;
        dragStateRef.current.isDragging = false;
        setIsTableDragging(false);
    };

    useEffect(() => {
        setCourseFilterId('all');
        setSelectedIds([]);
    }, [student?._id, detailTab]);

    useEffect(() => {
        const valid = new Set(enrollments.map((e) => String(e._id)));
        setSelectedIds((prev) => prev.filter((id) => valid.has(String(id))));
    }, [enrollments]);

    const courseTabs = useMemo(() => enrollments.map((e) => ({
        id: courseTabKey(e),
        title: e.course?.title || 'No course assigned',
    })), [enrollments]);

    const filteredEnrollments = useMemo(() => {
        if (courseFilterId === 'all') return enrollments;
        return enrollments.filter((e) => courseTabKey(e) === courseFilterId);
    }, [enrollments, courseFilterId]);

    const visibleEnrollments = useMemo(() => {
        const rows = [...filteredEnrollments];
        const dir = sortOrder === 'asc' ? 1 : -1;
        rows.sort((a, b) => {
            const va = getSortValue(a, student, sortBy);
            const vb = getSortValue(b, student, sortBy);
            if (typeof va === 'number' && typeof vb === 'number') {
                return (va - vb) * dir;
            }
            return String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' }) * dir;
        });
        return rows;
    }, [filteredEnrollments, student, sortBy, sortOrder]);

    const handleSort = (column) => {
        if (!SORTABLE_COLUMNS.has(column)) return;
        if (sortBy === column) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
            return;
        }
        setSortBy(column);
        setSortOrder(column === 'enrollmentDate' || column === 'added' || column === 'lastLogin' ? 'desc' : 'asc');
    };

    const allVisibleSelected = visibleEnrollments.length > 0
        && visibleEnrollments.every((e) => selectedIds.includes(String(e._id)));

    const toggleOne = (id) => {
        const key = String(id);
        setSelectedIds((prev) => (
            prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
        ));
    };

    const toggleAllVisible = () => {
        if (allVisibleSelected) {
            const visibleSet = new Set(visibleEnrollments.map((e) => String(e._id)));
            setSelectedIds((prev) => prev.filter((id) => !visibleSet.has(id)));
            return;
        }
        const merge = new Set([
            ...selectedIds,
            ...visibleEnrollments.map((e) => String(e._id)),
        ]);
        setSelectedIds([...merge]);
    };

    const startColumnResize = useCallback((e, colIndex) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startWidth = columnWidths[colIndex];
        const minWidth = COLUMN_MINS[colIndex] ?? 80;
        const maxWidth = COLUMN_MAXS[colIndex] ?? 600;
        let rafId = null;
        let latestWidth = startWidth;

        const onPointerMove = (ev) => {
            latestWidth = clamp(startWidth + (ev.clientX - startX), minWidth, maxWidth);
            if (rafId) return;
            rafId = window.requestAnimationFrame(() => {
                rafId = null;
                setColumnWidths((prev) => {
                    const next = [...prev];
                    next[colIndex] = latestWidth;
                    return next;
                });
            });
        };

        const stop = () => {
            window.removeEventListener('pointermove', onPointerMove);
            if (rafId) window.cancelAnimationFrame(rafId);
            document.body.style.cursor = '';
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', stop, { once: true });
        window.addEventListener('pointercancel', stop, { once: true });
        document.body.style.cursor = 'col-resize';
    }, [columnWidths]);

    if (!student) return null;

    const selectedEnrollments = enrollments.filter((e) => selectedIds.includes(String(e._id)));
    const parentsLabel = formatParentsLabel(student.parents || []);

    return (
        <div className="student-detail-overlay" role="dialog" aria-modal="true" aria-label="Student record">
            <div className="student-detail-overlay__panel">
                <header className="student-detail-overlay__header">
                    <div className="student-detail-overlay__identity">
                        <h2>
                            <i className="fas fa-user-graduate" aria-hidden />
                            {student.name || 'Student'}
                            {student.pendingSetup ? (
                                <span className="status-badge pending-setup">Pending setup</span>
                            ) : null}
                            {studentQuarantined ? (
                                <span className="status-badge inactive">Quarantined student</span>
                            ) : null}
                        </h2>
                        <p>
                            {student.studentId ? (
                                <span className="student-detail-overlay__sid">{student.studentId}</span>
                            ) : (
                                <span className="student-detail-overlay__sid student-detail-overlay__sid--empty">
                                    No roll number
                                </span>
                            )}
                            <span>Portal: {portalEmailDisplayLabel(student.email)}</span>
                            {student.personalEmail ? <span>{student.personalEmail}</span> : null}
                            {student.phone ? <span>{student.phone}</span> : null}
                            <span>Parent: {parentsLabel}</span>
                            <span>
                                Last login:{' '}
                                {student.lastLogin ? formatDateTime(student.lastLogin) : 'Never'}
                            </span>
                        </p>
                        <small className="student-detail-overlay__hint">
                            Each course is its own enrollment. Use checkboxes or the Actions column.
                        </small>
                    </div>
                    <div className="student-detail-overlay__header-actions">
                        {!studentQuarantined && detailTab === 'active' ? (
                            <button type="button" className="btn-primary btn-add" onClick={onAddCourse}>
                                <i className="fas fa-plus" aria-hidden /> Add course to this student
                            </button>
                        ) : null}
                        {!studentQuarantined ? (
                            <button
                                type="button"
                                className="btn-quarantine-student"
                                disabled={trashBusy}
                                onClick={onQuarantineStudent}
                                title="Move whole student to Quarantine"
                            >
                                <span className="btn-quarantine-student__icon" aria-hidden>
                                    <i className="fas fa-user-slash" />
                                </span>
                                <span className="btn-quarantine-student__copy">
                                    <strong>Move to Quarantine</strong>
                                    <small>Archive account + all courses</small>
                                </span>
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="lms-btn-restore"
                                    disabled={trashBusy}
                                    onClick={onRestoreStudent}
                                >
                                    <i className="fas fa-undo" aria-hidden /> Restore student
                                </button>
                                <button
                                    type="button"
                                    className="lms-btn-delete-forever"
                                    disabled={trashBusy}
                                    onClick={onPermanentDeleteStudent}
                                >
                                    <i className="fas fa-trash" aria-hidden /> Delete student forever
                                </button>
                            </>
                        )}
                        <button
                            type="button"
                            className="btn-secondary student-detail-overlay__close-icon"
                            onClick={onClose}
                            aria-label="Close"
                            title="Close"
                        >
                            <i className="fas fa-times" aria-hidden />
                        </button>
                    </div>
                </header>

                <div className="students-list-tabs student-detail-overlay__tabs">
                    <button
                        type="button"
                        className={`students-list-tab ${detailTab === 'active' ? 'active' : ''}`}
                        onClick={() => onDetailTabChange('active')}
                        disabled={studentQuarantined}
                    >
                        <i className="fas fa-list" aria-hidden /> {ACTIVE_RECORDS_LABEL}
                    </button>
                    <button
                        type="button"
                        className={`students-list-tab ${detailTab === 'trash' ? 'active' : ''}`}
                        onClick={() => onDetailTabChange('trash')}
                    >
                        <i className="fas fa-archive" aria-hidden /> {QUARANTINE_COURSES_LABEL}
                        {quarantineCount > 0 ? ` (${quarantineCount})` : ''}
                    </button>
                </div>

                {!loading && courseTabs.length > 0 ? (
                    <div className="student-detail-overlay__course-tabs" role="tablist" aria-label="Courses">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={courseFilterId === 'all'}
                            className={`student-detail-overlay__course-tab${courseFilterId === 'all' ? ' is-active' : ''}`}
                            onClick={() => setCourseFilterId('all')}
                        >
                            All courses ({enrollments.length})
                        </button>
                        {courseTabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={courseFilterId === tab.id}
                                className={`student-detail-overlay__course-tab${courseFilterId === tab.id ? ' is-active' : ''}`}
                                onClick={() => setCourseFilterId(tab.id)}
                                title={tab.title}
                            >
                                {tab.title}
                            </button>
                        ))}
                    </div>
                ) : null}

                <div className="student-detail-overlay__body">
                    {refreshing ? (
                        <div className="student-detail-overlay__refreshing" aria-live="polite">
                            <i className="fas fa-sync-alt fa-spin" aria-hidden /> Refreshing…
                        </div>
                    ) : null}
                    {loading && enrollments.length === 0 ? (
                        <div className="student-detail-overlay__loading">
                            <i className="fas fa-spinner fa-spin" aria-hidden /> Loading courses…
                        </div>
                    ) : enrollments.length === 0 ? (
                        <div className="student-detail-overlay__empty">
                            <i className="fas fa-book-open" aria-hidden />
                            <p>
                                {detailTab === 'trash'
                                    ? `No courses in ${QUARANTINE_COURSES_LABEL} for this student.`
                                    : 'No active course enrollments. Use Add course to this student.'}
                            </p>
                        </div>
                    ) : (
                        <>
                            {selectedEnrollments.length > 0 && !studentQuarantined ? (
                                <div className="bulk-actions-bar student-detail-overlay__toolbar">
                                    <div className="selected-count">
                                        <i className="fas fa-check-circle" aria-hidden />
                                        {selectedEnrollments.length} selected
                                    </div>
                                    <div className="bulk-buttons">
                                        {detailTab === 'active' ? (
                                            <>
                                                {selectedEnrollments.length === 1 ? (
                                                    <button
                                                        type="button"
                                                        className="bulk-btn edit"
                                                        disabled={trashBusy}
                                                        onClick={() => onEditEnrollment(selectedEnrollments[0])}
                                                    >
                                                        <i className="fas fa-edit" aria-hidden /> Edit
                                                    </button>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    className="bulk-btn delete"
                                                    disabled={trashBusy}
                                                    onClick={() => {
                                                        selectedEnrollments.forEach((row) => onQuarantineEnrollment(row));
                                                        setSelectedIds([]);
                                                    }}
                                                >
                                                    <i className="fas fa-archive" aria-hidden /> Move to {QUARANTINE_COURSES_LABEL}
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    type="button"
                                                    className="lms-btn-restore"
                                                    disabled={trashBusy}
                                                    onClick={() => {
                                                        selectedEnrollments.forEach((row) => onRestoreEnrollment(row._id));
                                                        setSelectedIds([]);
                                                    }}
                                                >
                                                    <i className="fas fa-undo" aria-hidden /> Restore
                                                </button>
                                                <button
                                                    type="button"
                                                    className="lms-btn-delete-forever"
                                                    disabled={trashBusy}
                                                    onClick={() => {
                                                        selectedEnrollments.forEach((row) => onPermanentDelete(row._id));
                                                        setSelectedIds([]);
                                                    }}
                                                >
                                                    <i className="fas fa-trash" aria-hidden /> Delete forever
                                                </button>
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            className="bulk-btn cancel"
                                            onClick={() => setSelectedIds([])}
                                        >
                                            <i className="fas fa-times" aria-hidden /> Clear
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            <div
                                ref={tableContainerRef}
                                className={`students-data-table-container student-detail-overlay__table-wrap${isTableDragging ? ' is-dragging' : ''}`}
                                onMouseDown={startTableDragScroll}
                                onMouseMove={onTableDragScroll}
                                onMouseUp={stopTableDragScroll}
                                onMouseLeave={stopTableDragScroll}
                            >
                                <table className="students-data-table student-detail-overlay__table">
                                    <colgroup>
                                        {columnWidths.map((w, i) => (
                                            <col key={COLUMN_KEYS[i]} style={{ width: `${w}px` }} />
                                        ))}
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            {COLUMN_KEYS.map((key, colIndex) => {
                                                const sortable = SORTABLE_COLUMNS.has(key);
                                                return (
                                                    <th
                                                        key={key}
                                                        className={key === 'checkbox' ? 'checkbox-cell' : undefined}
                                                    >
                                                        {key === 'checkbox' ? (
                                                            <input
                                                                type="checkbox"
                                                                checked={allVisibleSelected}
                                                                onChange={toggleAllVisible}
                                                                aria-label="Select all visible rows"
                                                                disabled={studentQuarantined}
                                                            />
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                className={`student-detail-overlay__sort-btn${sortable ? '' : ' is-static'}`}
                                                                onClick={() => handleSort(key)}
                                                                disabled={!sortable}
                                                            >
                                                                <span>{COLUMN_LABELS[key]}</span>
                                                                {sortable ? (
                                                                    <i
                                                                        className={`fas fa-${
                                                                            sortBy === key
                                                                                ? (sortOrder === 'asc' ? 'caret-up' : 'caret-down')
                                                                                : 'sort'
                                                                        }`}
                                                                        aria-hidden
                                                                    />
                                                                ) : null}
                                                            </button>
                                                        )}
                                                        {key !== 'checkbox' ? (
                                                            <span
                                                                className="col-resizer"
                                                                onPointerDown={(e) => startColumnResize(e, colIndex)}
                                                                onDoubleClick={() => {
                                                                    setColumnWidths((prev) => {
                                                                        const next = [...prev];
                                                                        next[colIndex] = COLUMN_WIDTHS[colIndex];
                                                                        return next;
                                                                    });
                                                                }}
                                                                role="separator"
                                                                aria-orientation="vertical"
                                                                aria-label={`Resize ${COLUMN_LABELS[key] || 'column'}`}
                                                            />
                                                        ) : null}
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleEnrollments.map((enrollment) => {
                                            const rowStudent = resolveRowStudent(enrollment, student);
                                            const course = enrollment.course || {};
                                            const teacher = getAllottedTeacherName(enrollment);
                                            const timeslot = formatScheduleTimeLabel(enrollment.assignedSchedule);
                                            const status = normalizeEnrollmentStatus(enrollment.status);
                                            const id = String(enrollment._id);
                                            const isSelected = selectedIds.includes(id);
                                            const parentLabel = formatParentsLabel(
                                                rowStudent.parents || student.parents || []
                                            );
                                            const lastLogin = rowStudent.lastLogin || student.lastLogin;
                                            return (
                                                <tr
                                                    key={enrollment._id}
                                                    className={isSelected ? 'selected' : ''}
                                                >
                                                    <td className="checkbox-cell">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => toggleOne(id)}
                                                            aria-label={`Select ${course.title || 'enrollment'}`}
                                                            disabled={studentQuarantined}
                                                        />
                                                    </td>
                                                    <td>
                                                        {rowStudent.studentId ? (
                                                            <span className="student-id-cell">{rowStudent.studentId}</span>
                                                        ) : (
                                                            <span className="student-id-cell no-id">—</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div className="student-info no-avatar">
                                                            <div className="student-details">
                                                                <strong>{rowStudent.name || 'Unknown Student'}</strong>
                                                                <span className="student-email">
                                                                    Portal: {portalEmailDisplayLabel(rowStudent.email)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="student-parent-cell" title={parentLabel}>
                                                            {parentLabel}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className="student-email-cell">
                                                            {rowStudent.personalEmail || '—'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className="student-phone-cell">
                                                            {rowStudent.phone || '—'}
                                                        </span>
                                                    </td>
                                                    <td className="student-detail-overlay__course-cell">
                                                        <strong>{course.title || 'No course assigned'}</strong>
                                                        {timeslot ? (
                                                            <span className="student-detail-overlay__timeslot">
                                                                {timeslot}
                                                            </span>
                                                        ) : null}
                                                    </td>
                                                    <td>{teacher || '—'}</td>
                                                    <td>{formatDateOnly(enrollment.enrollmentDate)}</td>
                                                    <td>{formatDateTime(rowStudent.createdAt || student.createdAt)}</td>
                                                    <td>
                                                        {lastLogin ? formatDateTime(lastLogin) : 'Never'}
                                                    </td>
                                                    <td>
                                                        <span className={`status-badge payment-${enrollment.paymentStatus || 'pending'}`}>
                                                            {(enrollment.paymentStatus || 'pending').charAt(0).toUpperCase()
                                                                + (enrollment.paymentStatus || 'pending').slice(1)}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className="status-cell">
                                                            <span className={`status-badge ${status}`}>
                                                                <i
                                                                    className={`fas fa-${
                                                                        status === 'active'
                                                                            ? 'check-circle'
                                                                            : status === 'completed'
                                                                              ? 'flag-checkered'
                                                                              : 'times-circle'
                                                                    }`}
                                                                    aria-hidden
                                                                />
                                                                {status}
                                                            </span>
                                                            {detailTab === 'active' && !studentQuarantined ? (
                                                                <select
                                                                    className="status-select-inline"
                                                                    value={status}
                                                                    onChange={(e) => onUpdateStatus(enrollment, e.target.value)}
                                                                    title="Change enrollment status"
                                                                >
                                                                    <option value="active">Active</option>
                                                                    <option value="inactive">Inactive</option>
                                                                    <option value="completed">Completed</option>
                                                                </select>
                                                            ) : null}
                                                        </div>
                                                    </td>
                                                    <td className="actions-cell action-col">
                                                        {studentQuarantined ? (
                                                            <span className="empty-cell">—</span>
                                                        ) : detailTab === 'active' ? (
                                                            <div className="action-buttons">
                                                                <button
                                                                    type="button"
                                                                    className="action-btn edit-btn"
                                                                    title="Edit"
                                                                    disabled={trashBusy}
                                                                    onClick={() => onEditEnrollment(enrollment)}
                                                                >
                                                                    <i className="fas fa-edit" aria-hidden /> Edit
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="action-btn delete-btn"
                                                                    title={`Move to ${QUARANTINE_COURSES_LABEL}`}
                                                                    disabled={trashBusy}
                                                                    onClick={() => onQuarantineEnrollment(enrollment)}
                                                                >
                                                                    <i className="fas fa-archive" aria-hidden /> Quarantine
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="action-buttons">
                                                                <button
                                                                    type="button"
                                                                    className="action-btn restore-btn"
                                                                    title="Restore"
                                                                    disabled={trashBusy}
                                                                    onClick={() => onRestoreEnrollment(enrollment._id)}
                                                                >
                                                                    <i className="fas fa-undo" aria-hidden /> Restore
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="action-btn delete-btn"
                                                                    title="Delete forever"
                                                                    disabled={trashBusy}
                                                                    onClick={() => onPermanentDelete(enrollment._id)}
                                                                >
                                                                    <i className="fas fa-times-circle" aria-hidden /> Delete forever
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StudentDetailOverlay;
