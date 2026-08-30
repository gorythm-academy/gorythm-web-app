const path = require('path');
const fs = require('fs');

/**
 * Keep the uploaded file's name (basename only), stripping unsafe path characters.
 */
function safeBasename(raw) {
    let name = String(raw || 'file').replace(/^.*[\\/]/, '').trim();
    if (!name || name === '.' || name === '..') name = 'file';
    name = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    if (name.length > 200) {
        const ext = path.extname(name);
        name = name.slice(0, Math.max(1, 200 - ext.length)) + ext;
    }
    return name;
}

function nextAvailableFilename(destDir, filename) {
    const ext = path.extname(filename);
    const stem = ext ? filename.slice(0, -ext.length) : filename;
    for (let i = 2; i < 10000; i++) {
        const candidate = `${stem} (${i})${ext}`;
        if (!fs.existsSync(path.join(destDir, candidate))) return candidate;
    }
    const stamp = Date.now();
    return ext ? `${stem}-${stamp}${ext}` : `${stem}-${stamp}`;
}

/**
 * Pick stored filename: optional admin override, otherwise original upload name.
 * @param {'error'|'suffix'} onDuplicate - error (default) or auto-append " (2)" etc.
 */
function resolveStoredFilename({
    destDir,
    originalName,
    overrideName,
    replacePath,
    publicPathFor,
    onDuplicate = 'error',
}) {
    const override = String(overrideName || '').trim();
    const filename = safeBasename(override || originalName || 'file');
    const abs = path.join(destDir, filename);

    const replacingSame =
        replacePath && typeof publicPathFor === 'function' && replacePath === publicPathFor(filename);

    if (fs.existsSync(abs) && !replacingSame) {
        if (onDuplicate === 'suffix') {
            return nextAvailableFilename(destDir, filename);
        }
        throw new Error(`"${filename}" already exists. Rename the file or delete the existing copy.`);
    }

    return filename;
}

module.exports = {
    safeBasename,
    nextAvailableFilename,
    resolveStoredFilename,
};
