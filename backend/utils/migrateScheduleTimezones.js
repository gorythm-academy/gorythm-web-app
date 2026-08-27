const ClassSchedule = require('../models/ClassSchedule');
const AdminSettings = require('../models/AdminSettings');
const logger = require('./logger');
const {
    canonicalizeScheduleTimezone,
    DEFAULT_ACADEMY_TIMEZONE,
} = require('./scheduleTimezone');

const SETTINGS_KEY = 'academy-settings';

/** One-time-safe: normalize academy settings + every class schedule timezone in MongoDB. */
async function migrateScheduleTimezones() {
    let settingsUpdated = false;
    const settings = await AdminSettings.findOne({ key: SETTINGS_KEY });
    if (settings) {
        const normalized = canonicalizeScheduleTimezone(
            settings.general?.timezone,
            DEFAULT_ACADEMY_TIMEZONE
        );
        if ((settings.general?.timezone || '') !== normalized) {
            settings.general = { ...settings.general, timezone: normalized };
            await settings.save();
            settingsUpdated = true;
        }
    }

    const academyTz = canonicalizeScheduleTimezone(
        settings?.general?.timezone,
        DEFAULT_ACADEMY_TIMEZONE
    );

    const schedules = await ClassSchedule.find({}).select('_id timezone').lean();
    let schedulesUpdated = 0;
    for (const row of schedules) {
        const normalized = canonicalizeScheduleTimezone(row.timezone, academyTz);
        if ((row.timezone || '') !== normalized) {
            await ClassSchedule.updateOne({ _id: row._id }, { $set: { timezone: normalized } });
            schedulesUpdated += 1;
        }
    }

    if (settingsUpdated || schedulesUpdated > 0) {
        logger.info('Normalized schedule timezones', {
            settingsUpdated,
            schedulesUpdated,
            academyTimezone: academyTz,
        });
    }
}

module.exports = { migrateScheduleTimezones };
