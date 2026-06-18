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

/**
 * Pick stored filename: optional admin override, otherwise original upload name.
 */
function resolveStoredFilename({ destDir, originalName, overrideName, replacePath, publicPathFor }) {
    const override = String(overrideName || '').trim();
    const filename = safeBasename(override || originalName || 'file');
    const abs = path.join(destDir, filename);

    const replacingSame =
        replacePath && typeof publicPathFor === 'function' && replacePath === publicPathFor(filename);

    if (fs.existsSync(abs) && !replacingSame) {
        throw new Error(`"${filename}" already exists. Rename the file or delete the existing copy.`);
    }

    return filename;
}

module.exports = {
    safeBasename,
    resolveStoredFilename,
};
