const nodemailer = require('nodemailer');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const ParentStudentLink = require('../models/ParentStudentLink');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');
const { activeCourseFilter } = require('../utils/courseQuery');
const {
    deliverableInbox,
    isRealPortalLogin,
} = require('../utils/studentPortalEmail');
const {
    createRawToken,
    hashToken,
    resetExpiresAt,
    resetUrl,
    WELCOME_TTL_MS,
} = require('./passwordReset');
const logger = require('../utils/logger');

const PEOPLE_ROLES = ['student', 'teacher', 'parent'];
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NOT_SENT_NO_INBOX = 'Not sent yet.';
const NOT_SENT_UNCONFIGURED = 'Not sent — email is not configured';
const NOT_SENT_FAILED = 'Not sent — email could not be delivered';

function inboxForUser(user) {
    return deliverableInbox(user?.personalEmail) || deliverableInbox(user?.email);
}

function createTransporter() {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
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

function formatTime12h(value) {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) return value || '';
    let hours = Number(match[1]);
    const minutes = match[2];
    const period = hours >= 12 ? 'PM' : 'AM';
    hours %= 12;
    if (hours === 0) hours = 12;
    return `${hours}:${minutes} ${period}`;
}

function scheduleZoneLabel(timezone) {
    const zone = String(timezone || 'Asia/Karachi').trim();
    if (!zone || zone === 'Asia/Karachi') return 'Pakistan time (PKT)';
    return zone;
}

function scheduleLine(enrollment) {
    const course = enrollment?.course?.title || '';
    if (!course) return '';
    const slot = enrollment.assignedSchedule;
    const teacher = slot?.teacher?.name || '';
    const day = slot && DAY_LABELS[slot.dayOfWeek] ? DAY_LABELS[slot.dayOfWeek] : '';
    const time = slot?.startTime && slot?.endTime
        ? `${formatTime12h(slot.startTime)}–${formatTime12h(slot.endTime)} ${scheduleZoneLabel(slot.timezone)}`
        : '';
    const when = [day, time].filter(Boolean).join(' ');
    const extra = [teacher, when].filter(Boolean).join(', ');
    return extra ? `${course} — ${extra}` : course;
}

function loginReadyLines({ user, setPasswordUrl, courses, children, includeChildren = true }) {
    const login = String(user?.email || '').trim();
    const lines = [
        'Your Gorythm Academy login is ready.',
        '',
        `Login: ${login}`,
    ];
    if (user?.role === 'student' && user?.studentId) {
        lines.push(`Roll Number: ${user.studentId}`);
    }
    lines.push(
        '',
        'Set your password with this link. It works once and expires in 48 hours:',
        setPasswordUrl,
        '',
        'If you did not expect this email, you can ignore it.',
    );
    const courseLines = (courses || []).filter(Boolean);
    if (courseLines.length) {
        const heading = user?.role === 'teacher' ? 'Assigned Courses:' : 'Courses:';
        lines.push('', heading, ...courseLines.map((line) => `- ${line}`));
    }
    const childLines = (children || []).filter(Boolean);
    if (includeChildren && user?.role === 'parent' && childLines.length) {
        lines.push('', 'Linked Students:', ...childLines.map((line) => `- ${line}`));
    }
    return lines;
}

function buildLoginCardText({ user, setPasswordUrl, courses, children }) {
    const name = user?.name || 'there';
    return [
        `Assalamu alaikum ${name},`,
        '',
        ...loginReadyLines({ user, setPasswordUrl, courses, children }),
        '',
        'Gorythm Academy',
    ].join('\n');
}

async function cardDetails(user) {
    if (user.role === 'teacher') {
        const courses = await Course.find({
            instructors: user._id,
            ...activeCourseFilter(),
        }).select('title').lean();
        return { courses: courses.map((course) => course.title).filter(Boolean), children: [] };
    }
    if (user.role === 'parent') {
        const links = await ParentStudentLink.find({ parent: user._id }).populate('student', 'name');
        return {
            courses: [],
            children: links.map((link) => link.student?.name).filter(Boolean),
        };
    }
    const enrollments = await Enrollment.find({
        student: user._id,
        course: { $ne: null },
        ...activeEnrollmentFilter(),
    })
        .populate('course', 'title')
        .populate({ path: 'assignedSchedule', populate: { path: 'teacher', select: 'name' } });
    return { courses: enrollments.map(scheduleLine).filter(Boolean), children: [] };
}

async function recipientAddresses(user) {
    const ownLogin = deliverableInbox(user?.email);
    if (ownLogin) return [ownLogin];
    const addresses = [];
    const add = (value) => {
        if (value && !addresses.includes(value)) addresses.push(value);
    };
    add(inboxForUser(user));
    if (user.role === 'student') {
        const links = await ParentStudentLink.find({ student: user._id }).populate('parent', 'email personalEmail');
        links.forEach((link) => add(inboxForUser(link.parent)));
    }
    return addresses;
}

function loginEmailStatus(user, extra = {}) {
    return {
        sent: !!extra.sent,
        sentAt: extra.sentAt || user?.loginEmailSentAt || null,
        sentTo: extra.sentTo || user?.loginEmailSentTo || [],
        error: extra.sent ? '' : (extra.error || ''),
    };
}

async function sendLoginCard(userId, { force = false } = {}) {
    const user = await User.findById(userId).select('+passwordResetTokenHash +passwordResetExpires');
    if (!user || user.deletedAt) return { sent: false, reason: 'missing_user', error: '' };
    const loginReady = isRealPortalLogin(user.email) || Boolean(deliverableInbox(user.email));
    if (!PEOPLE_ROLES.includes(user.role) || !loginReady) {
        return loginEmailStatus(user, { sent: false, reason: 'not_ready' });
    }
    if (!force && user.loginEmailSentAt) {
        return loginEmailStatus(user, {
            sent: false,
            reason: 'already_sent',
            sentAt: user.loginEmailSentAt,
            sentTo: user.loginEmailSentTo,
        });
    }

    const recipients = await recipientAddresses(user);
    if (!recipients.length) {
        user.loginEmailLastError = NOT_SENT_NO_INBOX;
        await user.save();
        return loginEmailStatus(user, { sent: false, error: NOT_SENT_NO_INBOX });
    }

    const transporter = createTransporter();
    if (!transporter) {
        user.loginEmailLastError = NOT_SENT_UNCONFIGURED;
        await user.save();
        return loginEmailStatus(user, { sent: false, error: NOT_SENT_UNCONFIGURED });
    }

    let claimedAt = null;
    if (!force) {
        const claimed = await User.findOneAndUpdate(
            {
                _id: user._id,
                $or: [{ loginEmailSentAt: null }, { loginEmailSentAt: { $exists: false } }],
            },
            { $set: { loginEmailSentAt: new Date(), loginEmailLastError: '' } },
            { new: true }
        );
        if (!claimed) {
            const current = await User.findById(user._id).select('loginEmailSentAt loginEmailSentTo loginEmailLastError');
            return loginEmailStatus(current, { sent: false, reason: 'already_sent' });
        }
        claimedAt = claimed.loginEmailSentAt;
    }

    const token = createRawToken();
    const details = await cardDetails(user);
    const text = buildLoginCardText({
        user,
        setPasswordUrl: resetUrl(token),
        courses: details.courses,
        children: details.children,
    });
    const subject = user.role === 'student'
        ? 'Your Gorythm Academy Student Login'
        : user.role === 'parent'
            ? 'Your Gorythm Academy Parent Login'
            : 'Your Gorythm Academy Teacher Login';

    try {
        await transporter.sendMail({
            from: fromAddress(),
            to: recipients.join(', '),
            subject,
            text,
        });
        const sentAt = force ? new Date() : claimedAt;
        await User.updateOne(
            { _id: user._id },
            {
                $set: {
                    loginEmailSentAt: sentAt,
                    loginEmailSentTo: recipients,
                    loginEmailLastError: '',
                    passwordResetTokenHash: hashToken(token),
                    passwordResetExpires: resetExpiresAt(Date.now(), WELCOME_TTL_MS),
                },
            }
        );
        return loginEmailStatus(user, { sent: true, sentAt, sentTo: recipients });
    } catch (error) {
        logger.warn('Login card email failed', { errorMessage: error.message, userId: String(user._id) });
        await User.updateOne(
            { _id: user._id },
            {
                $set: {
                    loginEmailLastError: NOT_SENT_FAILED,
                    ...(!force ? { loginEmailSentAt: null } : {}),
                },
            }
        );
        return loginEmailStatus(user, {
            sent: false,
            error: NOT_SENT_FAILED,
            sentAt: force ? user.loginEmailSentAt : null,
            sentTo: force ? user.loginEmailSentTo : [],
        });
    }
}

/** Login text and a one-time token, without sending. Null when a login email was already sent. */
async function prepareLoginAttachment(userId, { includeChildren = true } = {}) {
    const user = await User.findById(userId).select('name email personalEmail role studentId loginEmailSentAt deletedAt');
    if (!user || user.deletedAt || user.loginEmailSentAt) return null;
    if (!PEOPLE_ROLES.includes(user.role)) return null;
    if (!deliverableInbox(user.email) && !isRealPortalLogin(user.email)) return null;
    const token = createRawToken();
    const details = await cardDetails(user);
    const sentTo = deliverableInbox(user.email) || inboxForUser(user);
    const setPasswordUrl = resetUrl(token);
    return {
        userId: user._id,
        sentTo: sentTo ? [sentTo] : [],
        token,
        readyText: loginReadyLines({
            user,
            setPasswordUrl,
            courses: details.courses,
            children: details.children,
            includeChildren,
        }).join('\n'),
        text: buildLoginCardText({
            user,
            setPasswordUrl,
            courses: details.courses,
            children: details.children,
        }),
    };
}

async function commitLoginAttachment(attachment) {
    if (!attachment?.userId || !attachment.token) return false;
    const updated = await User.updateOne(
        {
            _id: attachment.userId,
            $or: [{ loginEmailSentAt: null }, { loginEmailSentAt: { $exists: false } }],
        },
        {
            $set: {
                loginEmailSentAt: new Date(),
                loginEmailSentTo: attachment.sentTo || [],
                loginEmailLastError: '',
                passwordResetTokenHash: hashToken(attachment.token),
                passwordResetExpires: resetExpiresAt(Date.now(), WELCOME_TTL_MS),
            },
        }
    );
    return updated.modifiedCount > 0;
}

module.exports = {
    PEOPLE_ROLES,
    NOT_SENT_NO_INBOX,
    buildLoginCardText,
    loginReadyLines,
    inboxForUser,
    sendLoginCard,
    loginEmailStatus,
    prepareLoginAttachment,
    commitLoginAttachment,
};
