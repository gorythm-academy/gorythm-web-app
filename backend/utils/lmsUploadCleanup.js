const fs = require('fs');
const Assignment = require('../models/Assignment');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const Resource = require('../models/Resource');
const Quiz = require('../models/Quiz');
const { categoryAbsolutePathFromPublic } = require('./uploadStorage');
const { uploadUrlVariants, normalizeUploadPublicPath } = require('./uploadUrlMatch');

function collectUrlsFromList(urls) {
    if (!Array.isArray(urls)) return [];
    return urls.map((u) => String(u || '').trim()).filter(Boolean);
}

function collectAssignmentUrls(doc) {
    if (!doc) return [];
    return collectUrlsFromList(doc.attachments);
}

function collectResourceUrls(doc) {
    if (!doc) return [];
    const urls = collectUrlsFromList(doc.attachments);
    if (doc.fileUrl) urls.push(String(doc.fileUrl).trim());
    return urls;
}

function collectSubmissionUrls(doc) {
    if (!doc) return [];
    return collectUrlsFromList(doc.attachments);
}

function collectQuizUrls(doc) {
    if (!doc?.resourceFileUrl) return [];
    return [String(doc.resourceFileUrl).trim()];
}

function uniqueUrls(urlLists) {
    const seen = new Set();
    const out = [];
    for (const list of urlLists) {
        for (const raw of list) {
            const normalized = normalizeUploadPublicPath(raw);
            if (!normalized || seen.has(normalized)) continue;
            seen.add(normalized);
            out.push(normalized);
        }
    }
    return out;
}

async function countUploadReferences(publicPath) {
    const normalized = normalizeUploadPublicPath(publicPath);
    if (!normalized) return 0;

    const variants = uploadUrlVariants(normalized);
    const relSuffix = normalized.replace('/api/uploads/', '');
    const suffixRegex =
        relSuffix && relSuffix !== normalized
            ? new RegExp(`${relSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
            : null;
    const attachmentQuery = suffixRegex
        ? { $or: [{ attachments: { $in: variants } }, { attachments: { $regex: suffixRegex } }] }
        : { attachments: { $in: variants } };

    const [assignments, submissions, resources, quizzes] = await Promise.all([
        Assignment.countDocuments(attachmentQuery),
        AssignmentSubmission.countDocuments(attachmentQuery),
        Resource.countDocuments({
            deletedAt: null,
            ...(suffixRegex
                ? {
                      $or: [
                          { fileUrl: { $in: variants } },
                          { fileUrl: { $regex: suffixRegex } },
                          ...attachmentQuery.$or,
                      ],
                  }
                : {
                      $or: [{ fileUrl: { $in: variants } }, { attachments: { $in: variants } }],
                  }),
        }),
        Quiz.countDocuments(
            suffixRegex
                ? {
                      $or: [
                          { resourceFileUrl: { $in: variants } },
                          { resourceFileUrl: { $regex: suffixRegex } },
                      ],
                  }
                : { resourceFileUrl: { $in: variants } }
        ),
    ]);

    return assignments + submissions + resources + quizzes;
}

function deleteFileFromDisk(publicPath) {
    const abs = categoryAbsolutePathFromPublic(publicPath);
    if (!abs || !fs.existsSync(abs)) return false;
    try {
        fs.unlinkSync(abs);
        return true;
    } catch {
        return false;
    }
}

async function cleanupOrphanUploads(urls) {
    const unique = uniqueUrls([urls]);
    let deleted = 0;
    for (const url of unique) {
        const refs = await countUploadReferences(url);
        if (refs === 0 && deleteFileFromDisk(url)) {
            deleted += 1;
        }
    }
    return deleted;
}

async function cleanupUrlsAfterPermanentDelete(urls) {
    return cleanupOrphanUploads(urls);
}

async function collectPermanentDeleteUrls(Model, ids, collector) {
    if (!ids?.length) return [];
    const docs = await Model.find({ _id: { $in: ids } }).lean();
    return uniqueUrls(docs.map(collector));
}

module.exports = {
    collectAssignmentUrls,
    collectResourceUrls,
    collectSubmissionUrls,
    collectQuizUrls,
    cleanupOrphanUploads,
    cleanupUrlsAfterPermanentDelete,
    collectPermanentDeleteUrls,
    countUploadReferences,
    deleteFileFromDisk,
};
