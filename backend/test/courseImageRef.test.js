const test = require('node:test');
const assert = require('node:assert/strict');
const { localCourseImagePath } = require('../utils/courseImageRef');

test('blank, upload, and local course images are kept', () => {
    assert.deepEqual(localCourseImagePath(''), { ok: true, value: '' });
    assert.deepEqual(localCourseImagePath('/api/uploads/courses-images/quran.jpg'), {
        ok: true,
        value: '/api/uploads/courses-images/quran.jpg',
    });
    assert.equal(
        localCourseImagePath('https://gorythmacademy.com/api/uploads/courses-images/quran.jpg').ok,
        true
    );
});

test('Unsplash and other outside image links are rejected', () => {
    const unsplash = localCourseImagePath('https://images.unsplash.com/photo-123?w=800');
    assert.equal(unsplash.ok, false);
    const other = localCourseImagePath('https://cdn.example.com/stock.jpg');
    assert.equal(other.ok, false);
});
