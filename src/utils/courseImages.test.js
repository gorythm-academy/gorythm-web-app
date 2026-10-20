import { getCourseImageCandidates, getCourseImageSrcSet, isOwnCourseImage } from './courseImages';

test('own uploads are used and Unsplash links are not', () => {
  expect(isOwnCourseImage('/api/uploads/courses-images/quran.jpg')).toBe(true);
  expect(isOwnCourseImage('https://images.unsplash.com/photo-1')).toBe(false);
  expect(isOwnCourseImage('https://cdn.example.com/stock.jpg')).toBe(false);

  const fromUpload = getCourseImageCandidates({
    slug: 'nazrah-with-tajweed',
    homepageImage: '/api/uploads/courses-images/quran.jpg',
  });
  expect(fromUpload[0]).toContain('/api/uploads/courses-images/quran.jpg');

  const fromUnsplash = getCourseImageCandidates({
    slug: 'nazrah-with-tajweed',
    homepageImage: 'https://images.unsplash.com/photo-1',
  });
  expect(fromUnsplash[0]).toBe('/images/courses/nazrah-with-tajweed.avif');
  expect(fromUnsplash.join(' ')).not.toContain('unsplash');
});

test('uploaded course art asks the server for smaller widths', () => {
  const set = getCourseImageSrcSet('https://gorythmacademy.com/api/uploads/courses-images/nazrah.webp');
  expect(set).toContain('/api/uploads/courses-images/nazrah.webp?w=480 480w');
  expect(set).toContain('w=800 800w');
  expect(set).toContain('w=1200 1200w');
  expect(getCourseImageSrcSet('/images/courses/nazrah-with-tajweed.webp')).toBeUndefined();
});
