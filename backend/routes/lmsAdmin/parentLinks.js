const express = require('express');
const router = express.Router();

const ParentStudentLink = require('../../models/ParentStudentLink');
const User = require('../../models/User');
const { activeUserFilter } = require('../../utils/userQuery');

// ——— Parent ↔ student links ———
router.get('/parent-links', async (req, res) => {
    try {
        const linksOnly = req.query.linksOnly === '1' || req.query.linksOnly === 'true';
        const linksRaw = await ParentStudentLink.find()
            .populate('parent', 'name email deletedAt')
            .populate('student', 'name email studentId deletedAt')
            .sort({ createdAt: -1 })
            .lean();
        const links = linksRaw.filter((l) => l.parent && !l.parent.deletedAt && l.student && !l.student.deletedAt);
        if (linksOnly) {
            return res.json({ success: true, links });
        }
        const parents = await User.find({ role: 'parent', ...activeUserFilter() })
            .select('name email')
            .sort({ name: 1 })
            .limit(50);
        const students = await User.find({ role: 'student', ...activeUserFilter() })
            .select('name email studentId')
            .sort({ name: 1 })
            .limit(50);
        res.json({ success: true, links, parents, students });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load parent links' });
    }
});

router.post('/parent-links', async (req, res) => {
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

        const existing = await ParentStudentLink.findOne({ parent: parentId, student: studentId });
        const link = await ParentStudentLink.findOneAndUpdate(
            { parent: parentId, student: studentId },
            { relation },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        )
            .populate('parent', 'name email')
            .populate('student', 'name email studentId');
        res.json({ success: true, link, created: !existing });
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

router.delete('/parent-links/:id', async (req, res) => {
    try {
        const link = await ParentStudentLink.findByIdAndDelete(req.params.id);
        if (!link) {
            return res.status(404).json({ success: false, error: 'Link not found' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to remove link' });
    }
});

router.patch('/parent-links/:id', async (req, res) => {
    try {
        const link = await ParentStudentLink.findById(req.params.id);
        if (!link) {
            return res.status(404).json({ success: false, error: 'Link not found' });
        }

        const relation = String(req.body?.relation || '').trim();
        const parentId = req.body?.parentId;
        const studentId = req.body?.studentId;
        const allowedRelations = ['father', 'mother', 'guardian', 'other'];

        if (relation && allowedRelations.includes(relation)) {
            link.relation = relation;
        }
        if (parentId) {
            const parent = await User.findOne({ _id: parentId, role: 'parent', ...activeUserFilter() });
            if (!parent) {
                return res.status(400).json({ success: false, error: 'Invalid or removed parent' });
            }
            link.parent = parent._id;
        }
        if (studentId) {
            const student = await User.findOne({ _id: studentId, role: 'student', ...activeUserFilter() });
            if (!student) {
                return res.status(400).json({ success: false, error: 'Invalid or removed student' });
            }
            link.student = student._id;
        }

        const { assertStudentCanLinkToParent } = require('../../utils/parentStudentLinkRules');
        await assertStudentCanLinkToParent(link.student, link.parent, { exceptLinkId: link._id });

        await link.save();
        const populated = await ParentStudentLink.findById(link._id)
            .populate('parent', 'name email deletedAt')
            .populate('student', 'name email studentId deletedAt')
            .lean();
        res.json({ success: true, link: populated });
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
        res.status(500).json({ success: false, error: 'Failed to update parent link' });
    }
});

module.exports = router;
