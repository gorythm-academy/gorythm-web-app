/**
 * Merge enrollment.student (may be ObjectId or partial doc) with a known student record.
 */
export function mergeEnrollmentStudent(enrollmentStudent, fallbackStudent) {
    const base = fallbackStudent && typeof fallbackStudent === 'object' ? { ...fallbackStudent } : {};
    if (!enrollmentStudent) return base;

    if (typeof enrollmentStudent === 'object' && enrollmentStudent.name) {
        return {
            ...base,
            ...enrollmentStudent,
            _id: enrollmentStudent._id || base._id,
        };
    }

    return base;
}
