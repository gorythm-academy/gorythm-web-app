require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { syncAllRostersFromEnrollments } = require('../utils/enrollmentOrphanCleanup');
const Enrollment = require('../models/Enrollment');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    const before = await Enrollment.countDocuments({});
    const { synced } = await syncAllRostersFromEnrollments();
    const after = await Enrollment.countDocuments({});
    console.log({ before, synced, after, note: 'Syncs User/Course rosters from enrollment rows only' });
    await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
