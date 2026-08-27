/** Shared course catalog sort + masonry column placement (homepage & single course). */

export const CATEGORY_ORDER = [
  'Quranic Arabic',
  'Tajweed',
  'Islamic Studies',
  'Seerah',
  'STEM',
  'Memorization (Hifz)',
  'Fiqh',
  'Hadith',
  'Aqeedah',
  'Other',
];

export const DESKTOP_MASONRY_MQ = '(min-width: 1280px)';

export const getCategorySortIndex = (category) => {
  const i = CATEGORY_ORDER.indexOf(category || '');
  return i === -1 ? CATEGORY_ORDER.length : i;
};

export const getDisplayOrder = (course) => {
  const order = Number(course?.displayOrder);
  return Number.isFinite(order) ? order : 9999;
};

export const getMasonryColumn = (course) => {
  const col = Number(course?.masonryColumn);
  return [1, 2, 3].includes(col) ? col : null;
};

export const sortCoursesForCatalog = (items = []) =>
  [...items].sort(
    (a, b) =>
      getDisplayOrder(a) - getDisplayOrder(b) ||
      getCategorySortIndex(a.category) - getCategorySortIndex(b.category) ||
      (a.title || '').localeCompare(b.title || '')
  );

export const buildMasonryColumns = (items, columnCount = 3) => {
  const columns = Array.from({ length: columnCount }, () => []);
  let autoIndex = 0;
  items.forEach((course) => {
    const forcedCol = getMasonryColumn(course);
    if (forcedCol) {
      const targetCol = Math.min(forcedCol, columnCount);
      columns[targetCol - 1].push(course);
      return;
    }
    columns[autoIndex % columnCount].push(course);
    autoIndex += 1;
  });
  return columns;
};

/** Column index (0-based) for a course in the masonry layout, or -1 if not found. */
export const getCourseMasonryColumnIndex = (sortedCourses, courseId, columnCount = 3) => {
  const columns = buildMasonryColumns(sortedCourses, columnCount);
  const id = String(courseId);
  for (let col = 0; col < columns.length; col += 1) {
    if (columns[col].some((c) => String(c._id) === id)) return col;
  }
  return -1;
};
