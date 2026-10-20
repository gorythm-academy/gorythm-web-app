import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import { QUARANTINE_LABEL } from '../../../utils/adminListLabels';
import { getAdminErrorMessage, joinAdminErrors } from '../../../utils/adminApi';
import { teacherAccountStatus } from '../../../utils/teacherAccountStatus';
import { normalizeStaffStatus } from './usersManagementShared';

export function useUsersRecordActions({
    users,
    isRowActionsLocked,
    isStaffTab,
    showConfirm,
    showAlert,
    setUsers,
    setSelectedUsers,
    reloadAfterMutation,
    trashBusy,
    setTrashBusy,
    selectedUsers,
    listTab,
    variant,
}) {
    const statusLabel = (status) => (
        variant === 'teachers' ? teacherAccountStatus({ status }) : status
    );
    const toggleUserSelection = (userId) => {
        const u = users.find((x) => x._id === userId);
        if (u && isRowActionsLocked(u)) return;
        setSelectedUsers(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    const updateUserStatus = async (userId, currentStatus, targetStatus) => {
        const user = users.find(u => u._id === userId);
        if (user && isRowActionsLocked(user)) return;
        const effectiveStatus = isStaffTab ? normalizeStaffStatus(currentStatus) : currentStatus;
        const newStatus = targetStatus || (effectiveStatus === 'active' ? 'inactive' : 'active');
        if (newStatus === effectiveStatus) return;

        const confirmed = await showConfirm({
            title: 'Change User Status?',
            message: `Change "${user?.name || 'this user'}" from ${statusLabel(effectiveStatus)} to ${statusLabel(newStatus)}?`,
            confirmLabel: 'Change Status',
        });
        if (!confirmed) {
            return;
        }

        try {
            const token = getAuthToken();
            await axios.patch(
                `${API_BASE_URL}/api/users/${userId}/status`,
                { status: newStatus },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setUsers(prev => prev.map(row =>
                row._id === userId
                    ? { ...row, status: newStatus, isActive: newStatus === 'active' }
                    : row
            ));

            showAlert(`User status set to ${statusLabel(newStatus)}.`, 'success');
        } catch (error) {
            console.error('Error updating user status:', error);
            showAlert(getAdminErrorMessage(error, 'Failed to update user status'), 'error');
        }
    };

    const deleteUser = async (userId) => {
        const user = users.find(u => u._id === userId);
        if (user && isRowActionsLocked(user)) return;

        const confirmed = await showConfirm({
            title: `Move to ${QUARANTINE_LABEL}?`,
            message: `Move "${user?.name || 'this user'}" to ${QUARANTINE_LABEL}? They will lose portal and login access. Restore from the ${QUARANTINE_LABEL} tab.`,
            confirmLabel: `Move to ${QUARANTINE_LABEL}`,
        });
        if (!confirmed) {
            return;
        }

        try {
            const token = getAuthToken();
            await axios.delete(`${API_BASE_URL}/api/users/${userId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            await reloadAfterMutation();
            setSelectedUsers(prev => prev.filter(id => id !== userId));

            showAlert(`User moved to ${QUARANTINE_LABEL}.`, 'success');
        } catch (error) {
            console.error('Error moving user to quarantine:', error);
            showAlert(getAdminErrorMessage(error, `Failed to move user to ${QUARANTINE_LABEL}`), 'error');
        }
    };

    const restoreUser = async (userId) => {
        if (trashBusy) return;
        setTrashBusy(true);
        try {
            const token = getAuthToken();
            await axios.patch(`${API_BASE_URL}/api/users/${userId}/restore`, null, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await reloadAfterMutation();
            showAlert('User restored.', 'success');
        } catch (error) {
            showAlert(getAdminErrorMessage(error, 'Failed to restore user'), 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    const restoreSelectedUsers = async () => {
        if (trashBusy || !selectedUsers.length) return;
        setTrashBusy(true);
        const token = getAuthToken();
        const ids = [...selectedUsers];
        let restored = 0;
        const failures = [];

        for (const id of ids) {
            try {
                await axios.patch(`${API_BASE_URL}/api/users/${id}/restore`, null, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                restored += 1;
            } catch (error) {
                failures.push(error);
            }
        }

        await reloadAfterMutation();
        setSelectedUsers([]);
        setTrashBusy(false);

        const failed = failures.length;
        const reason = joinAdminErrors(failures);
        if (failed === 0) {
            showAlert(`${restored} user(s) restored.`, 'success');
        } else if (restored === 0) {
            showAlert(reason || `Failed to restore ${failed} user(s).`, 'error');
        } else {
            showAlert(
                `Restored ${restored} user(s). ${failed} could not be restored.${reason ? ` ${reason}` : ''}`,
                'warning'
            );
        }
    };

    const permanentDeleteSelectedUsers = async () => {
        if (trashBusy || !selectedUsers.length || listTab !== 'trash') return;

        const confirmed = await showConfirm({
            title: 'Delete Permanently?',
            message: `Permanently delete ${selectedUsers.length} user(s)? This cannot be undone.`,
            confirmLabel: 'Delete forever',
        });
        if (!confirmed) return;

        setTrashBusy(true);
        const token = getAuthToken();
        const ids = [...selectedUsers];
        let deleted = 0;
        const failures = [];

        for (const id of ids) {
            try {
                await axios.delete(`${API_BASE_URL}/api/users/${id}/permanent`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                deleted += 1;
            } catch (error) {
                failures.push(error);
            }
        }

        await reloadAfterMutation();
        setSelectedUsers([]);
        setTrashBusy(false);

        const failed = failures.length;
        const reason = joinAdminErrors(failures);
        if (failed === 0) {
            showAlert(`${deleted} user(s) permanently deleted.`, 'success');
        } else if (deleted === 0) {
            showAlert(reason || `Failed to permanently delete ${failed} user(s).`, 'error');
        } else {
            showAlert(
                `Deleted ${deleted} user(s). ${failed} could not be deleted.${reason ? ` ${reason}` : ''}`,
                'warning'
            );
        }
    };

    const permanentDeleteUser = async (userId) => {
        if (listTab !== 'trash' || trashBusy) return;
        const confirmed = await showConfirm({
            title: 'Delete Permanently?',
            message: 'This cannot be undone. The user account will be removed from the database.',
            confirmLabel: 'Delete forever',
        });
        if (!confirmed) return;
        setTrashBusy(true);
        try {
            const token = getAuthToken();
            await axios.delete(`${API_BASE_URL}/api/users/${userId}/permanent`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await reloadAfterMutation();
            setSelectedUsers((prev) => prev.filter((id) => id !== userId));
            showAlert('User permanently deleted.', 'success');
        } catch (error) {
            showAlert(getAdminErrorMessage(error, 'Failed to permanently delete user'), 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    const deleteSelectedUsers = async () => {
        if (!selectedUsers.length) {
            showAlert('Please select users to delete', 'warning');
            return;
        }

        const confirmed = await showConfirm({
            title: `Move to ${QUARANTINE_LABEL}?`,
            message: `Move ${selectedUsers.length} selected user(s) to ${QUARANTINE_LABEL}? They will lose portal and login access.`,
            confirmLabel: `Move to ${QUARANTINE_LABEL}`,
        });
        if (!confirmed) {
            return;
        }

        try {
            const token = getAuthToken();
            const response = await axios.post(
                `${API_BASE_URL}/api/users/bulk-delete`,
                { ids: selectedUsers },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            await reloadAfterMutation();
            setSelectedUsers([]);

            showAlert(response.data.message || `${selectedUsers.length} user(s) moved to ${QUARANTINE_LABEL}.`, 'success');
        } catch (error) {
            console.error('Error deleting selected users:', error);
            showAlert(getAdminErrorMessage(error, 'Failed to delete users'), 'error');
        }
    };

    const updateSelectedStatus = async (status) => {
        if (!selectedUsers.length) {
            showAlert('Please select users to update', 'warning');
            return;
        }

        const confirmed = await showConfirm({
            title: 'Update User Status?',
            message: `Set ${selectedUsers.length} selected user(s) to ${statusLabel(status)}?`,
            confirmLabel: 'Update Status',
        });
        if (!confirmed) {
            return;
        }

        try {
            const token = getAuthToken();
            await axios.patch(`${API_BASE_URL}/api/users/bulk-status`,
                { ids: selectedUsers, status },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            await reloadAfterMutation();
            showAlert(`${selectedUsers.length} user(s) set to ${statusLabel(status)} successfully!`, 'success');
        } catch (error) {
            console.error('Error updating selected users status:', error);
            showAlert(getAdminErrorMessage(error, 'Failed to update status'), 'error');
        }
    };

    return {
        toggleUserSelection,
        updateUserStatus,
        deleteUser,
        restoreUser,
        restoreSelectedUsers,
        permanentDeleteSelectedUsers,
        permanentDeleteUser,
        deleteSelectedUsers,
        updateSelectedStatus,
    };
}
