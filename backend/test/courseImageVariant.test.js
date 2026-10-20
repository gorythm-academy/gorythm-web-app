const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveCourseVariant } = require('../utils/courseImageVariant');

test('course image variants only allow a single safe filename and known widths', () => {
    assert.deepEqual(resolveCourseVariant('/nazrah.webp', '480'), {
        filename: 'nazrah.webp',
        width: 480,
    });
    assert.equal(resolveCourseVariant('/nazrah.webp', '100'), null);
    assert.equal(resolveCourseVariant('/variants/nazrah.webp', '480'), null);
    assert.equal(resolveCourseVariant('/../nazrah.webp', '480'), null);
    assert.equal(resolveCourseVariant('/nazrah.txt', '800'), null);
});
