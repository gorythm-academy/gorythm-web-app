const AdminSettings = require('../models/AdminSettings');
const {
    canonicalizeScheduleTimezone,
    DEFAULT_ACADEMY_TIMEZONE,
} = require('../utils/scheduleTimezone');

const SETTINGS_KEY = 'academy-settings';

async function getAcademyTimezone() {
    const settings = await AdminSettings.findOne({ key: SETTINGS_KEY })
        .select('general.timezone')
        .lean();
    return canonicalizeScheduleTimezone(settings?.general?.timezone, DEFAULT_ACADEMY_TIMEZONE);
}

module.exports = { getAcademyTimezone, DEFAULT_ACADEMY_TIMEZONE };
