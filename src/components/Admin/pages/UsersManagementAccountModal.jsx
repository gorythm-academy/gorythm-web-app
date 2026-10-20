import { formatScheduleLabel } from '../../../utils/formatScheduleLabel';
import { Link } from 'react-router-dom';
import { teacherAccountStatus } from '../../../utils/teacherAccountStatus';
import { normalizeStaffStatus } from './usersManagementShared';

export function UsersManagementAccountModal({ state }) {
  const {
    isStaffTab,
    listTab,
    setViewUser,
    variant,
    viewTeacherSlots,
    viewTeacherSlotsLoading,
    viewUser,
  } = state;

  return (
    <>
            {viewUser && (
                <div className="user-modal-overlay" role="dialog" aria-modal="true">
                    <div className="user-modal user-view-modal">
                        <div className="user-modal-header">
                            <h2><i className="fas fa-eye"></i> Account Details</h2>
                            <button type="button" className="modal-close-btn" onClick={() => setViewUser(null)}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="form-scroll-container">
                            <dl className="user-details-readonly">
                                <dt>Name</dt><dd>{viewUser.name}</dd>
                                <dt>Email</dt><dd className="admin-email">{viewUser.email}</dd>
                                {viewUser.role === 'student' && (
                                    <>
                                        <dt>Personal Email</dt>
                                        <dd className="admin-email">{viewUser.personalEmail || '—'}</dd>
                                    </>
                                )}
                                <dt>Role</dt><dd>{viewUser.role}</dd>
                                <dt>Phone</dt><dd>{viewUser.phone || '—'}</dd>
                                <dt>Status</dt>
                                <dd>
                                    {variant === 'teachers'
                                        ? teacherAccountStatus(viewUser, { quarantined: listTab === 'trash' })
                                        : isStaffTab
                                            ? normalizeStaffStatus(viewUser.status)
                                            : viewUser.status}
                                </dd>
                                <dt>Joined</dt><dd>{viewUser.joinDate ? new Date(viewUser.joinDate).toLocaleString() : '—'}</dd>
                                <dt>Last Login</dt><dd>{viewUser.lastLogin ? new Date(viewUser.lastLogin).toLocaleString() : 'Never'}</dd>
                                {variant === 'teachers' && viewUser.role === 'teacher' && (
                                    <>
                                        <dt>Class Slots</dt>
                                        <dd>
                                            {viewTeacherSlotsLoading ? (
                                                'Loading…'
                                            ) : viewTeacherSlots.length === 0 ? (
                                                'None yet — manage in LMS → Class Schedules'
                                            ) : (
                                                <ul className="teacher-slots-readonly">
                                                    {viewTeacherSlots.map((slot) => (
                                                        <li key={slot._id}>
                                                            <strong>{slot.course?.title || 'Course'}</strong>
                                                            {' — '}
                                                            {formatScheduleLabel(slot)}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                            <p className="form-hint" style={{ marginTop: '0.5rem' }}>
                                                <Link to="/admin/lms">Open LMS Class Schedules</Link> to edit.
                                            </p>
                                        </dd>
                                    </>
                                )}
                            </dl>
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn-primary" onClick={() => setViewUser(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
    </>
  );
}
