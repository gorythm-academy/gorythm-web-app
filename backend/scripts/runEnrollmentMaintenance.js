/**
 * Manual enrollment maintenance (run offline — never on list fetch).
 * Usage: node backend/scripts/runEnrollmentMaintenance.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const {
    removeOrphanEnrollmentRows,
    syncAllRostersFromEnrollments,
} = require('../utils/enrollmentOrphanCleanup');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    const orphan = await removeOrphanEnrollmentRows();
    const roster = await syncAllRostersFromEnrollments();
    console.log({ orphan, roster });
    await mongoose.disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
