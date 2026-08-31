const express = require('express');
const router = express.Router();

const authMiddleware = require('../../middleware/auth');
const { validateSessionUser } = require('../../middleware/validateSessionUser');
const { allowRoles } = require('../../middleware/authorize');

router.use(authMiddleware);
router.use(validateSessionUser);
router.use(allowRoles('super-admin', 'manager'));

/**
 * Split out of a single ~2,100-line lmsAdmin.js into focused sub-routers.
 * Each file below owns one feature area; this file only wires them together.
 */
router.use(require('./schedules'));
router.use(require('./parentLinks'));
router.use(require('./teacherAttendance'));
router.use(require('./badges'));
router.use(require('./resources'));
router.use(require('./assignments'));
router.use(require('./submissions'));
router.use(require('./quizAttempts'));
router.use(require('./payroll'));

module.exports = router;
