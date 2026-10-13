const logger = require('./logger');

/** True for MongoDB "duplicate key" errors (a unique index refused the write). */
function isDuplicateKeyError(err) {
    return Boolean(err) && (err.code === 11000 || err.code === 11001);
}

/**
 * Unique indexes are built in the background when the app starts. If old data already breaks
 * the rule the build fails quietly; this makes that visible in the server log.
 */
function reportIndexErrors(Model) {
    Model.on('index', (err) => {
        if (err) {
            logger.error('Index build failed - remove duplicate rows, then restart', {
                model: Model.modelName,
                err,
            });
        }
    });
}

module.exports = { isDuplicateKeyError, reportIndexErrors };
