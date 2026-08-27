const { isProtectedSuperAdmin, isSuperAdminRole } = require('./protectedSuperAdmin');

/** Admin staff who cannot delete each other (manager ↔ accountant). */
const STAFF_PEER_ROLES = new Set(['manager', 'accountant']);

/**
 * @returns {string|null} Block reason, or null if delete is allowed.
 */
function getUserDeleteBlockReason(actorRole, targetUser) {
    if (!targetUser) return 'User not found';
    if (isProtectedSuperAdmin(targetUser)) {
        return 'The primary super-admin account cannot be deleted';
    }
    if (isSuperAdminRole(targetUser.role)) {
        return 'Super-admin accounts cannot be deleted';
    }
    if (STAFF_PEER_ROLES.has(actorRole) && STAFF_PEER_ROLES.has(targetUser.role)) {
        return 'Managers and accountants cannot delete other admin staff accounts';
    }
    return null;
}

function canActorDeleteUser(actorRole, targetUser) {
    return getUserDeleteBlockReason(actorRole, targetUser) === null;
}

module.exports = {
    STAFF_PEER_ROLES,
    getUserDeleteBlockReason,
    canActorDeleteUser,
};
