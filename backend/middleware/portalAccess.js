/**
 * Portal route access: role owners + admin/super-admin preview (X-Portal-Preview-Role header).
 */
const allowPortalRoles = (...roles) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (roles.includes(req.user.role)) {
        return next();
    }

    const previewRole = String(req.header('X-Portal-Preview-Role') || '').trim();
    if (
        ['admin', 'super-admin'].includes(req.user.role) &&
        previewRole &&
        roles.includes(previewRole)
    ) {
        req.portalPreview = true;
        req.portalPreviewRole = previewRole;
        return next();
    }

    return res.status(403).json({
        success: false,
        error: `Forbidden: requires one of roles: ${roles.join(', ')}`,
    });
};

function getPortalActorId(req) {
    if (req.portalPreview) return null;
    return req.user?.userId || req.user?.id || null;
}

function previewDashboardPayload(role) {
    return {
        success: true,
        previewMode: true,
        message: 'Admin preview — log in as a portal user to see live data tied to that account.',
        summary: {
            enrolledCourses: 0,
            attendanceRate: 0,
            assignmentsDue: 0,
            quizzesAvailable: 0,
            pendingFees: 0,
            coursesManaged: 0,
            assignmentsCount: 0,
            quizzesCount: 0,
            pendingSubmissions: 0,
            childrenCount: 0,
            enrollmentsCount: 0,
            attendanceRecords: 0,
            quizAttempts: 0,
            payments: 0,
            completed: 0,
            pending: 0,
            refunded: 0,
            failed: 0,
        },
        enrollments: [],
        courses: [],
        children: [],
        role,
    };
}

module.exports = { allowPortalRoles, getPortalActorId, previewDashboardPayload };
