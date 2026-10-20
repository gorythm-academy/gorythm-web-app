import { QUARANTINE_LABEL } from '../../../utils/adminListLabels';
import ScheduleClock from '../../shared/ScheduleClock';
import AdminTablePagination from '../shared/AdminTablePagination';
import { teacherAccountStatus } from '../../../utils/teacherAccountStatus';
import { COLUMN_LABELS, displayRoleLabel, normalizeStaffStatus } from './usersManagementShared';

export function UsersManagementTable({ state }) {
  const {
    columnWidths,
    deleteUser,
    handleSort,
    isLearnerTab,
    isRowActionsLocked,
    isStaffTab,
    isTableDragging,
    listTab,
    onTableDragScroll,
    openCreateModal,
    openEditModal,
    openViewModal,
    page,
    parentChildrenById,
    permanentDeleteUser,
    resetColumnWidth,
    restoreUser,
    selectableFilteredUsers,
    selectedUsers,
    setPage,
    showAddButton,
    sortBy,
    sortOrder,
    sortedUsers,
    startColumnResize,
    startTableDragScroll,
    stopTableDragScroll,
    tableColumnKeys,
    tableContainerRef,
    teacherCoursesById,
    teacherSlotsById,
    toggleAllUsers,
    toggleUserSelection,
    total,
    totalPages,
    trashBusy,
    updateUserStatus,
    users,
    variant,
    variantConfig,
  } = state;

  return (
    <>
            {/* Users Table */}
            <div
                ref={tableContainerRef}
                className={`users-table-container ${isTableDragging ? 'is-dragging' : ''}`}
                onMouseDown={startTableDragScroll}
                onMouseMove={onTableDragScroll}
                onMouseUp={stopTableDragScroll}
                onMouseLeave={stopTableDragScroll}
            >
                <table className="users-table">
                    <colgroup>
                        {tableColumnKeys.map((key, idx) => (
                            <col
                                key={key}
                                style={
                                    key === 'actions'
                                        ? { width: '1%' }
                                        : { width: `${columnWidths[idx]}px` }
                                }
                            />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            {tableColumnKeys.map((colKey, idx) => {
                                if (colKey === 'checkbox') {
                                    return (
                                        <th key={colKey} className="checkbox-cell">
                                            <input
                                                type="checkbox"
                                                checked={
                                                    selectableFilteredUsers.length > 0 &&
                                                    selectedUsers.length === selectableFilteredUsers.length
                                                }
                                                onChange={toggleAllUsers}
                                            />
                                            <span
                                                className="col-resizer"
                                                onPointerDown={(e) => startColumnResize(e, idx)}
                                                onDoubleClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    resetColumnWidth(idx);
                                                }}
                                            />
                                        </th>
                                    );
                                }
                                if (colKey === 'actions') {
                                    return (
                                        <th key={colKey} className="action-col">
                                            {COLUMN_LABELS.actions}
                                            <span
                                                className="col-resizer"
                                                onPointerDown={(e) => startColumnResize(e, idx)}
                                                onDoubleClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    resetColumnWidth(idx);
                                                }}
                                            />
                                        </th>
                                    );
                                }
                                const sortable = colKey !== 'assignedCourses' && colKey !== 'children';
                                return (
                                    <th
                                        key={colKey}
                                        className={sortable ? 'sortable' : ''}
                                        onClick={sortable ? () => handleSort(colKey) : undefined}
                                    >
                                        {COLUMN_LABELS[colKey]}
                                        {sortable ? (
                                            sortBy === colKey ? (
                                                <i
                                                    className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}
                                                ></i>
                                            ) : (
                                                <i className="fas fa-sort"></i>
                                            )
                                        ) : null}
                                        <span
                                            className="col-resizer"
                                            onPointerDown={(e) => startColumnResize(e, idx)}
                                            onDoubleClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                resetColumnWidth(idx);
                                            }}
                                        />
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedUsers.map((user) => (
                            <tr key={user._id} className={selectedUsers.includes(user._id) ? 'selected' : ''}>
                                {tableColumnKeys.map((colKey) => {
                                    if (colKey === 'checkbox') {
                                        return (
                                            <td key={colKey} className="checkbox-cell">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedUsers.includes(user._id)}
                                                    onChange={() => toggleUserSelection(user._id)}
                                                    disabled={isRowActionsLocked(user)}
                                                />
                                            </td>
                                        );
                                    }
                                    if (colKey === 'user') {
                                        const showRoleUnderName = variant === 'teachers' || variant === 'parents';
                                        const roleIcon =
                                            user.role === 'teacher'
                                                ? 'chalkboard-teacher'
                                                : user.role === 'parent'
                                                  ? 'people-roof'
                                                  : user.role === 'super-admin'
                                                    ? 'user-shield'
                                                    : user.role === 'manager'
                                                      ? 'user-cog'
                                                      : user.role === 'accountant'
                                                        ? 'calculator'
                                                        : 'user-graduate';
                                        return (
                                            <td key={colKey}>
                                                <div className="user-info">
                                                    <div className="user-avatar">
                                                        {user.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="user-details">
                                                        <strong>{user.name}</strong>
                                                        {showRoleUnderName ? (
                                                            <span className={`user-role-under-name role-badge ${user.role}`}>
                                                                <i className={`fas fa-${roleIcon}`} aria-hidden="true" />
                                                                {displayRoleLabel(user.role)}
                                                            </span>
                                                        ) : null}
                                                        {user.role === 'student' && user.studentId && (
                                                            <span className="student-id-tag">
                                                                <i className="fas fa-id-card"></i> {user.studentId}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        );
                                    }
                                    if (colKey === 'role') {
                                        return (
                                            <td key={colKey}>
                                                <span className={`role-badge ${user.role}`}>
                                                    <i
                                                        className={`fas fa-${
                                                            user.role === 'super-admin'
                                                                ? 'user-shield'
                                                                : user.role === 'manager'
                                                                  ? 'user-cog'
                                                                  : user.role === 'teacher'
                                                                    ? 'chalkboard-teacher'
                                                                    : user.role === 'accountant'
                                                                      ? 'calculator'
                                                                      : user.role === 'parent'
                                                                        ? 'people-roof'
                                                                        : 'user-graduate'
                                                        }`}
                                                    ></i>
                                                    {displayRoleLabel(user.role)}
                                                </span>
                                            </td>
                                        );
                                    }
                                    if (colKey === 'status') {
                                        const storedStatus = isStaffTab
                                            ? normalizeStaffStatus(user.status)
                                            : (user.status === 'pending' ? 'inactive' : (user.status || 'inactive'));
                                        const displayStatus = variant === 'teachers'
                                            ? teacherAccountStatus(user, { quarantined: listTab === 'trash' })
                                            : storedStatus;
                                        return (
                                            <td key={colKey}>
                                                <div className="status-cell">
                                                    <span className={`status-badge ${displayStatus}`}>
                                                        <i
                                                            className={`fas fa-${
                                                                displayStatus === 'active'
                                                                    ? 'check-circle'
                                                                    : displayStatus === 'complete'
                                                                      ? 'flag-checkered'
                                                                      : displayStatus === 'quarantine'
                                                                        ? 'archive'
                                                                        : 'times-circle'
                                                            }`}
                                                        ></i>
                                                        {displayStatus}
                                                    </span>
                                                    {listTab === 'active' && !isRowActionsLocked(user) ? (
                                                        <select
                                                            className="status-select-inline"
                                                            value={storedStatus}
                                                            onChange={(e) => updateUserStatus(user._id, storedStatus, e.target.value)}
                                                            title="Change Status"
                                                        >
                                                            <option value="active">{variant === 'teachers' ? 'active' : 'Active'}</option>
                                                            <option value="inactive">{variant === 'teachers' ? 'inactive' : 'Inactive'}</option>
                                                            {!isStaffTab ? (
                                                                <option value="completed">{variant === 'teachers' ? 'complete' : 'Completed'}</option>
                                                            ) : null}
                                                        </select>
                                                    ) : null}
                                                </div>
                                            </td>
                                        );
                                    }
                                    if (colKey === 'assignedCourses') {
                                        const courses = teacherCoursesById[String(user._id)] || [];
                                        const teacherSlots = teacherSlotsById[String(user._id)] || [];
                                        return (
                                            <td key={colKey} className="cell-meta-col cell-meta-col--stacked">
                                                {courses.length ? (
                                                    <div className="meta-col-stack">
                                                        {courses.map((c) => {
                                                            const courseSlots = teacherSlots.filter(
                                                                (s) =>
                                                                    String(s.course?._id || s.course) ===
                                                                    String(c._id)
                                                            );
                                                            return (
                                                                <div key={c._id} className="meta-col-row meta-col-row--course">
                                                                    <i className="fas fa-book" aria-hidden="true" />
                                                                    <div className="meta-col-course">
                                                                        <span className="meta-col-course__title">{c.title}</span>
                                                                        {courseSlots.length ? (
                                                                            <ul className="meta-col-course__slots">
                                                                                {courseSlots.map((slot) => (
                                                                                    <li key={slot._id}>
                                                                                        <ScheduleClock slot={slot} audience="staff" />
                                                                                    </li>
                                                                                ))}
                                                                            </ul>
                                                                        ) : (
                                                                            <span className="meta-col-course__slots-empty">
                                                                                No timeslot yet
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <span className="empty-cell">—</span>
                                                )}
                                            </td>
                                        );
                                    }
                                    if (colKey === 'children') {
                                        const links = parentChildrenById[String(user._id)] || [];
                                        return (
                                            <td key={colKey} className="cell-meta-col cell-meta-col--stacked">
                                                {links.length ? (
                                                    <div className="meta-col-stack">
                                                        {links.map((l) => (
                                                            <div key={l._id} className="meta-col-row">
                                                                <i className="fas fa-child" aria-hidden="true" />
                                                                <span>
                                                                    {l.student?.name || 'Student'}
                                                                    {l.student?.studentId
                                                                        ? ` (${l.student.studentId})`
                                                                        : ''}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="empty-cell">—</span>
                                                )}
                                            </td>
                                        );
                                    }
                                    if (colKey === 'phone') {
                                        return (
                                            <td key={colKey}>
                                                <span className="phone-info">{user.phone || 'Not set'}</span>
                                            </td>
                                        );
                                    }
                                    if (colKey === 'email') {
                                        return (
                                            <td key={colKey} className="cell-email">
                                                <span className="email-cell" title={user.email}>
                                                    {user.email}
                                                </span>
                                            </td>
                                        );
                                    }
                                    if (colKey === 'personalEmail') {
                                        return (
                                            <td key={colKey} className="cell-email">
                                                {user.personalEmail ? (
                                                    <span
                                                        className="email-cell personal-email-cell"
                                                        title={user.personalEmail}
                                                    >
                                                        <i className="fas fa-envelope-open-text" aria-hidden="true"></i>{' '}
                                                        {user.personalEmail}
                                                    </span>
                                                ) : (
                                                    <span className="empty-cell">—</span>
                                                )}
                                            </td>
                                        );
                                    }
                                    if (colKey === 'joined') {
                                        return (
                                            <td key={colKey}>
                                                {user.joinDate
                                                    ? new Date(user.joinDate).toLocaleDateString()
                                                    : 'N/A'}
                                            </td>
                                        );
                                    }
                                    if (colKey === 'lastLogin') {
                                        return (
                                            <td key={colKey}>
                                                {user.lastLogin
                                                    ? new Date(user.lastLogin).toLocaleString(undefined, {
                                                          dateStyle: 'short',
                                                          timeStyle: 'short',
                                                      })
                                                    : 'Never'}
                                            </td>
                                        );
                                    }
                                    if (colKey === 'actions') {
                                        return (
                                            <td key={colKey} className="cell-actions action-col">
                                    <div className="action-buttons">
                                        {isRowActionsLocked(user) ? (
                                            <button
                                                type="button"
                                                className="action-btn view-btn"
                                                title="View details (read-only)"
                                                onClick={() => openViewModal(user)}
                                            >
                                                <i className="fas fa-eye"></i> View
                                            </button>
                                        ) : listTab === 'trash' ? (
                                            <>
                                                <button
                                                    className="action-btn restore-btn"
                                                    title="Restore"
                                                    disabled={trashBusy}
                                                    onClick={() => restoreUser(user._id)}
                                                >
                                                    <i className="fas fa-undo"></i> Restore
                                                </button>
                                                <button
                                                    className="action-btn delete-btn"
                                                    title="Delete Permanently"
                                                    disabled={trashBusy}
                                                    onClick={() => permanentDeleteUser(user._id)}
                                                >
                                                    <i className="fas fa-times-circle"></i> Delete forever
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    className="action-btn edit-btn"
                                                    title="Edit"
                                                    onClick={() => openEditModal(user)}
                                                >
                                                    <i className="fas fa-edit"></i> Edit
                                                </button>
                                                <button
                                                    className="action-btn delete-btn"
                                                    title={`Move to ${QUARANTINE_LABEL}`}
                                                    onClick={() => deleteUser(user._id)}
                                                >
                                                    <i className="fas fa-trash"></i> Delete
                                                </button>
                                            </>
                                        )}
                                    </div>
                                            </td>
                                        );
                                    }
                                    return null;
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>

                {sortedUsers.length === 0 && (() => {
                    const hasAnyUsers = users.length > 0;
                    const emptyTitle = hasAnyUsers
                        ? 'No matching records'
                        : isLearnerTab
                          ? 'No learners yet'
                          : 'No staff accounts yet';
                    const emptySubtitle = hasAnyUsers
                        ? 'Try a different search term or filter to find who you’re looking for.'
                        : isLearnerTab
                          ? 'Add your first student, teacher, or parent to get started.'
                          : 'Invite your first admin or accountant to start managing the platform.';
                    return (
                        <div className="no-results">
                            <div className="no-results__icon" aria-hidden="true">
                                <i className={`fas ${hasAnyUsers ? 'fa-magnifying-glass' : 'fa-user-slash'}`}></i>
                            </div>
                            <h3>{emptyTitle}</h3>
                            <p>{emptySubtitle}</p>
                            {showAddButton && !hasAnyUsers && (
                                <button
                                    type="button"
                                    className="btn-primary empty-state-cta"
                                    onClick={openCreateModal}
                                >
                                    <span className="empty-state-cta__icon" aria-hidden="true">
                                        <i className="fas fa-user-plus"></i>
                                    </span>
                                    <span className="empty-state-cta__label">
                                        {isLearnerTab ? variantConfig.addLabel : 'Add Your First Staff User'}
                                    </span>
                                    <span className="empty-state-cta__arrow" aria-hidden="true">
                                        <i className="fas fa-arrow-right"></i>
                                    </span>
                                </button>
                            )}
                        </div>
                    );
                })()}
            </div>

            <div className="users-list-pagination">
                <span className="users-list-pagination__count">
                    {total} record{total === 1 ? '' : 's'}
                    {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ''}
                </span>
                <AdminTablePagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                />
            </div>

    </>
  );
}
