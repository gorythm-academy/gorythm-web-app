const express = require('express');
const router = express.Router();

const authMiddleware = require('../../middleware/auth');
const { validateSessionUser } = require('../../middleware/validateSessionUser');
const { allowRoles } = require('../../middleware/authorize');
const { getPortalActorId } = require('../../middleware/portalAccess');
const ParentStudentLink = require('../../models/ParentStudentLink');
const User = require('../../models/User');
const { activeUserFilter } = require('../../utils/userQuery');

router.use(authMiddleware);
router.use(validateSessionUser);
router.use((req, res, next) => {
    req.portalActorId = getPortalActorId(req);
    next();
});

/**
 * Split out of a single ~2,900-line portal.js into one file per portal realm.
 * `helpers.js` holds the cross-realm utilities (enrollment/attendance/quiz helpers);
 * this file only wires the realm routers together.
 */
router.use(require('./student'));
router.use(require('./teacher'));
router.use(require('./parent'));
router.use(require('./accountant'));

// Legacy admin link endpoint (portal path)
router.post('/admin/link-parent-student', allowRoles('manager', 'super-admin'), async (req, res) => {
    try {
        const { parentId, studentId, relation = 'guardian' } = req.body;
        if (!parentId || !studentId) {
            return res.status(400).json({ success: false, error: 'parentId and studentId are required' });
        }
        const parent = await User.findOne({ _id: parentId, role: 'parent', ...activeUserFilter() });
        const student = await User.findOne({ _id: studentId, role: 'student', ...activeUserFilter() });
        if (!parent || !student) {
            return res.status(400).json({ success: false, error: 'Invalid or removed parent/student' });
        }
        const { assertStudentCanLinkToParent } = require('../../utils/parentStudentLinkRules');
        await assertStudentCanLinkToParent(studentId, parentId);
        const link = await ParentStudentLink.findOneAndUpdate(
            { parent: parentId, student: studentId },
            { relation },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        res.json({ success: true, link });
    } catch (error) {
        if (error.status === 400) {
            return res.status(400).json({ success: false, error: error.message });
        }
        if (error?.code === 11000) {
            return res.status(400).json({
                success: false,
                error: 'This student already has a parent linked. Remove the existing link first, or edit that link.',
            });
        }
        res.status(500).json({ success: false, error: 'Failed to link parent and student' });
    }
});

module.exports = router;
