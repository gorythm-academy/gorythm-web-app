/** Remove embedded quiz answers from course modules for student-facing APIs. */
function stripCourseModulesForStudent(course) {
    const obj = course?.toObject ? course.toObject() : { ...course };
    return {
        ...obj,
        modules: (obj.modules || []).map((mod) => ({
            title: mod.title,
            videos: mod.videos || [],
            documents: mod.documents || [],
            quizzes: (mod.quizzes || []).map((q) => ({
                title: q.title,
                questionCount: Array.isArray(q.questions) ? q.questions.length : 0,
            })),
        })),
    };
}

module.exports = { stripCourseModulesForStudent };
