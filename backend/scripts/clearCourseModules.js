const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Course = require('../models/Course');
const logger = require('../utils/logger');

async function clearCourseModules() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not defined in backend/.env');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    const result = await Course.updateMany({}, { $unset: { modules: 1 } });
    logger.info('Removed modules field from all courses', {
        matched: result.matchedCount,
        modified: result.modifiedCount,
    });
    await mongoose.disconnect();
}

clearCourseModules()
    .then(() => process.exit(0))
    .catch((err) => {
        logger.error('clearCourseModules failed', { err });
        process.exit(1);
    });
