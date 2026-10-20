import { UsersManagementFormModal } from './UsersManagementFormModal';
import { UsersManagementTable } from './UsersManagementTable';
import { UsersManagementAccountModal } from './UsersManagementAccountModal';
import { ACTIVE_RECORDS_LABEL, QUARANTINE_LABEL } from '../../../utils/adminListLabels';
import AdminSearchBox from '../shared/AdminSearchBox';

export function UsersManagementView({ state }) {
  const {
    deleteSelectedUsers,
    downloadUsersCsv,
    embedded,
    fetchUsers,
    filterRole,
    flushUserSearch,
    handleManualRefresh,
    isLearnerTab,
    isRowActionsLocked,
    isStaffTab,
    listStats,
    listTab,
    loading,
    openCreateModal,
    openEditModal,
    permanentDeleteSelectedUsers,
    restoreSelectedUsers,
    restoreUser,
    searchTerm,
    selectedUsers,
    setFilterRole,
    setListTab,
    setSearchTerm,
    setSelectedUsers,
    showAddButton,
    showAlert,
    statsByRole,
    total,
    trashBusy,
    trashCount,
    updateSelectedStatus,
    users,
    variant,
    variantConfig,
  } = state;

  return (
    <div className="users-management">
            <UsersManagementFormModal state={state} />

            {!embedded && (
            <div className="page-header">
                <div className="header-left">
                    <h1>
                        <i className={`fas ${isLearnerTab ? variantConfig.icon : 'fa-users-cog'}`}></i>{' '}
                        {variantConfig.pageTitle}
                    </h1>
                    <p>
                        {variant === 'teachers' ? (
                            <>Teachers can be created without courses. Assign courses here or from the Courses tab — same list.</>
                        ) : variant === 'parents' ? (
                            <>Parent/guardian accounts (link children in the Parent Links tab).</>
                        ) : (
                            <>Managers, super-admins, and accountants. Learners are under <strong>Students</strong>, <strong>Teachers</strong>, and <strong>Parents</strong>.</>
                        )}
                    </p>
                </div>
                <div className="header-right">
                    {showAddButton && listTab === 'active' && (
                        <button type="button" className="btn-primary btn-add" onClick={openCreateModal}>
                            <i className="fas fa-user-plus"></i>{' '}
                            {isLearnerTab ? variantConfig.addLabel : 'Add Staff User'}
                        </button>
                    )}
                </div>
            </div>
            )}

            {embedded && showAddButton && listTab === 'active' && (
                <div className="users-embedded-actions">
                    <button type="button" className="btn-primary btn-add" onClick={openCreateModal}>
                        <i className="fas fa-user-plus"></i>{' '}
                        {isLearnerTab ? variantConfig.addLabel : 'Add Staff User'}
                    </button>
                </div>
            )}

            <div className="students-list-tabs users-list-tabs">
                <button
                    type="button"
                    className={`students-list-tab ${listTab === 'active' ? 'active' : ''}`}
                    onClick={() => {
                        setListTab('active');
                        setSelectedUsers([]);
                    }}
                >
                    <i className="fas fa-list" /> {ACTIVE_RECORDS_LABEL}
                </button>
                <button
                    type="button"
                    className={`students-list-tab ${listTab === 'trash' ? 'active' : ''}`}
                    onClick={() => {
                        setListTab('trash');
                        setSelectedUsers([]);
                    }}
                >
                    <i className="fas fa-archive" /> {QUARANTINE_LABEL}
                    {trashCount > 0 ? ` (${trashCount})` : ''}
                </button>
            </div>

            {/* Search and Filter */}
            <div className="controls-bar">
                <AdminSearchBox
                    placeholder={
                        variant === 'parents'
                            ? 'Search parents by name, email, phone, child, or relation…'
                            : isLearnerTab
                            ? 'Search learners by name, email or phone…'
                            : 'Search users by name, email or phone…'
                    }
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onEnter={() => {
                        const q = flushUserSearch();
                        fetchUsers({ force: true, page: 1, search: q });
                    }}
                />
                
                <div className="filter-controls">
                    {variant !== 'parents' ? (
                        <select
                            className="role-filter"
                            value={filterRole}
                            onChange={(e) => setFilterRole(e.target.value)}
                        >
                            {variant === 'teachers' ? (
                                <>
                                    <option value="all">All Teachers</option>
                                    <option value="teacher">Teachers</option>
                                </>
                            ) : (
                                <>
                                    <option value="all">All Staff Roles</option>
                                    <option value="super-admin">Super Admin</option>
                                    <option value="manager">Manager</option>
                                    <option value="accountant">Accountant</option>
                                </>
                            )}
                        </select>
                    ) : null}

                    <button className="refresh-btn" onClick={handleManualRefresh} type="button" title="Refresh" aria-label="Refresh">
                        <i className="fas fa-sync-alt"></i>
                    </button>
                    <button className="btn-secondary download-btn" onClick={downloadUsersCsv}>
                        <i className="fas fa-file-export"></i> Download CSV
                    </button>
                </div>
            </div>

            {loading && users.length > 0 ? (
                <div className="users-list-refreshing" aria-live="polite">
                    <i className="fas fa-spinner fa-spin" aria-hidden /> Refreshing…
                </div>
            ) : null}

            {/* Bulk Actions Bar — directly above table */}
            {selectedUsers.length > 0 && (
                <div className="bulk-actions-bar">
                    <div className="selected-count">
                        <i className="fas fa-check-circle"></i>
                        {selectedUsers.length} user(s) selected
                    </div>
                    <div className="bulk-buttons">
                        {listTab === 'active' ? (
                            <>
                                <button 
                                    className="bulk-btn" 
                                    onClick={() => updateSelectedStatus('active')}
                                >
                                    <i className="fas fa-check"></i> Activate All
                                </button>
                                <button 
                                    className="bulk-btn" 
                                    onClick={() => updateSelectedStatus('inactive')}
                                >
                                    <i className="fas fa-ban"></i> Deactivate All
                                </button>
                                <button 
                                    className="bulk-btn delete" 
                                    onClick={deleteSelectedUsers}
                                >
                                    <i className="fas fa-archive"></i> Move to {QUARANTINE_LABEL}
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    className="bulk-btn"
                                    disabled={trashBusy}
                                    onClick={isStaffTab ? restoreSelectedUsers : async () => {
                                        for (const id of selectedUsers) {
                                            await restoreUser(id);
                                        }
                                        setSelectedUsers([]);
                                    }}
                                >
                                    <i className="fas fa-undo"></i> Restore selected
                                </button>
                                <button
                                    className="bulk-btn delete"
                                    disabled={trashBusy}
                                    onClick={permanentDeleteSelectedUsers}
                                >
                                    <i className="fas fa-trash-alt"></i> Delete Permanently
                                </button>
                            </>
                        )}
                        <button
                            className="bulk-btn edit"
                            onClick={() => {
                                if (selectedUsers.length !== 1) {
                                    showAlert('Please select only one record to edit', 'warning');
                                    return;
                                }
                                const user = users.find((u) => String(u._id) === String(selectedUsers[0]));
                                if (!user) {
                                    showAlert('Selected record not found', 'warning');
                                    return;
                                }
                                if (isRowActionsLocked(user)) {
                                    showAlert('This account cannot be edited from here', 'warning');
                                    return;
                                }
                                openEditModal(user);
                            }}
                        >
                            <i className="fas fa-edit"></i> Edit Selected
                        </button>
                        <button 
                            className="bulk-btn cancel" 
                            onClick={() => setSelectedUsers([])}
                        >
                            <i className="fas fa-times"></i> Clear Selection
                        </button>
                    </div>
                </div>
            )}

            <UsersManagementTable state={state} />

            {/* Stats Summary */}
            <div className="stats-summary">
                {isLearnerTab ? (
                    <>
                        <div className="stat-card">
                            <div className="stat-icon total">
                                <i className="fas fa-users"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{listStats?.total ?? total}</h3>
                                <p>Total learners</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon teachers">
                                <i className="fas fa-user-graduate"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{statsByRole.student ?? 0}</h3>
                                <p>Students</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon teachers">
                                <i className="fas fa-chalkboard-teacher"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{statsByRole.teacher ?? 0}</h3>
                                <p>Teachers</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon active">
                                <i className="fas fa-people-roof"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{statsByRole.parent ?? 0}</h3>
                                <p>Parents</p>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="stat-card">
                            <div className="stat-icon total">
                                <i className="fas fa-users"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{listStats?.total ?? total}</h3>
                                <p>Staff accounts</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon admin">
                                <i className="fas fa-user-shield"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{statsByRole['super-admin'] ?? 0}</h3>
                                <p>Super admins</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon admin">
                                <i className="fas fa-user-cog"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{statsByRole.manager ?? 0}</h3>
                                <p>Admins</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon teachers">
                                <i className="fas fa-calculator"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{statsByRole.accountant ?? 0}</h3>
                                <p>Accountants</p>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <UsersManagementAccountModal state={state} />
        </div>
  );
}
