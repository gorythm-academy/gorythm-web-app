const fs = require('fs');

const startsWith = (buf, bytes, offset = 0) =>
    buf.length >= offset + bytes.length && bytes.every((byte, i) => buf[offset + i] === byte);

const SIGNATURES = {
    'application/pdf': (buf) => startsWith(buf, [0x25, 0x50, 0x44, 0x46]),
    'image/jpeg': (buf) => startsWith(buf, [0xff, 0xd8, 0xff]),
    'image/png': (buf) => startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    'image/webp': (buf) => startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8),
    'application/msword': (buf) => startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (buf) =>
        startsWith(buf, [0x50, 0x4b, 0x03, 0x04]),
};

/** True when the first bytes match what the declared type should start with. */
function bufferMatchesMime(buffer, mimetype) {
    const check = SIGNATURES[mimetype];
    return Boolean(check && check(buffer));
}

async function fileMatchesMime(filePath, mimetype) {
    const handle = await fs.promises.open(filePath, 'r');
    try {
        const buffer = Buffer.alloc(16);
        const { bytesRead } = await handle.read(buffer, 0, 16, 0);
        return bufferMatchesMime(buffer.subarray(0, bytesRead), mimetype);
    } finally {
        await handle.close();
    }
}

module.exports = { bufferMatchesMime, fileMatchesMime };
