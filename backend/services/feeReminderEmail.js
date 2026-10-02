const nodemailer = require('nodemailer');
const Enrollment = require('../models/Enrollment');
const ParentStudentLink = require('../models/ParentStudentLink');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');
const { pktYmd, enrollmentAllFeesPaid, enrollmentFeeIsFree } = require('../utils/feeDueDate');
const logger = require('../utils/logger');

const DAYS_BEFORE_DUE = 3;

function compareYmd(a, b) {
    if (!a || !b) return 0;
    if (a.y !== b.y) return a.y - b.y;
    if (a.m !== b.m) return a.m - b.m;
    return a.d - b.d;
}

function addDaysYmd(ymd, days) {
    const date = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + days));
    return {
        y: date.getUTCFullYear(),
        m: date.getUTCMonth() + 1,
        d: date.getUTCDate(),
    };
}

function ymdKey(ymd) {
    if (!ymd) return '';
    return `${ymd.y}-${String(ymd.m).padStart(2, '0')}-${String(ymd.d).padStart(2, '0')}`;
}

function formatYmd(ymd) {
    if (!ymd) return '';
    return `${String(ymd.d).padStart(2, '0')}/${String(ymd.m).padStart(2, '0')}/${ymd.y}`;
}

function createTransporter() {
    const {
        SMTP_HOST,
        SMTP_PORT,
        SMTP_USER,
        SMTP_PASSWORD,
    } = process.env;
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) return null;
    return nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        secure: Number(SMTP_PORT) === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    });
}

function fromAddress() {
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const fromName = process.env.SMTP_FROM_NAME || 'Gorythm Academy';
    return `"${fromName}" <${fromEmail}>`;
}

function reminderKind(enrollment, now = new Date()) {
    if (!enrollment) return null;
    const status = String(enrollment.status || '').toLowerCase();
    if (status === 'paused' || status === 'completed') return null;
    const pay = String(enrollment.paymentStatus || '').toLowerCase();
    if (pay === 'cancelled' || pay === 'refunded') return null;
    const due = pktYmd(enrollment.feeDueDate);
    const today = pktYmd(now);
    if (!due || !today) return null;
    const dueKey = ymdKey(due);
    if (compareYmd(today, due) > 0) {
        if (enrollment.feeReminderOverdueSentFor === dueKey) return null;
        return { kind: 'overdue', dueKey, due };
    }
    if (compareYmd(today, addDaysYmd(due, -DAYS_BEFORE_DUE)) === 0) {
        if (enrollment.feeReminderDueSentFor === dueKey) return null;
        return { kind: 'due', dueKey, due };
    }
    return null;
}

function recipientEmails(student, parent) {
    const emails = [];
    const add = (user) => {
        const personal = String(user?.personalEmail || '').trim();
        const email = String(user?.email || '').trim();
        const pick = personal || email;
        if (pick && !emails.includes(pick.toLowerCase())) emails.push(pick.toLowerCase());
    };
    add(student);
    add(parent);
    return emails;
}

function reminderCopy(kind, enrollment, studentName) {
    const course = enrollment.course?.title || 'your course';
    const due = formatYmd(pktYmd(enrollment.feeDueDate));
    const name = studentName || 'Student';
    if (kind === 'due') {
        return {
            subject: `Fee reminder — ${course} due ${due}`,
            text: `Assalamu alaikum ${name},\n\nA fee for ${course} is due on ${due} (Pakistan time). Please pay from Fees by card or bank transfer.\n\nGorythm Academy`,
        };
    }
    return {
        subject: `Fee overdue — ${course}`,
        text: `Assalamu alaikum ${name},\n\nThe fee for ${course} is now overdue (due ${due}, Pakistan time). Please pay from Fees as soon as you can.\n\nGorythm Academy`,
    };
}

async function sendDueFeeReminders(now = new Date()) {
    const transporter = createTransporter();
    if (!transporter) return { checked: 0, sent: 0, skipped: 0 };

    const enrollments = await Enrollment.find({
        status: { $nin: ['completed', 'paused'] },
        paymentStatus: { $nin: ['cancelled', 'refunded'] },
        feeDueDate: { $ne: null },
        ...activeEnrollmentFilter(),
    })
        .populate('course', 'title price totalFeeCount')
        .populate('student', 'name email personalEmail role');

    let sent = 0;
    let skipped = 0;
    for (const enrollment of enrollments) {
        if (enrollmentAllFeesPaid(enrollment) || enrollmentFeeIsFree(enrollment)) {
            skipped += 1;
            continue;
        }
        const match = reminderKind(enrollment, now);
        if (!match) {
            skipped += 1;
            continue;
        }
        const student = enrollment.student;
        if (!student) {
            skipped += 1;
            continue;
        }
        const link = await ParentStudentLink.findOne({ student: student._id }).populate('parent', 'name email personalEmail');
        const to = recipientEmails(student, link?.parent);
        if (!to.length) {
            skipped += 1;
            continue;
        }
        const copy = reminderCopy(match.kind, enrollment, student.name);
        try {
            await transporter.sendMail({
                from: fromAddress(),
                to: to.join(', '),
                subject: copy.subject,
                text: copy.text,
            });
            if (match.kind === 'due') enrollment.feeReminderDueSentFor = match.dueKey;
            else enrollment.feeReminderOverdueSentFor = match.dueKey;
            await enrollment.save();
            sent += 1;
        } catch (err) {
            logger.warn('Fee reminder email failed', {
                enrollmentId: String(enrollment._id),
                errorMessage: err.message,
            });
            skipped += 1;
        }
    }
    return { checked: enrollments.length, sent, skipped };
}

module.exports = {
    DAYS_BEFORE_DUE,
    reminderKind,
    sendDueFeeReminders,
};
