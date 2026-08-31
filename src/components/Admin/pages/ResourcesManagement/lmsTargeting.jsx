import React from 'react';
import { toLocalDateStr } from '../../../../utils/academyWeek';

export const minDueDateValue = () => toLocalDateStr(new Date());

export const computeTargetPairs = (courseIds, teacherIds, courseTeachers) => {
  const pairs = [];
  const courses = (courseIds || []).map(String);
  const teachers = (teacherIds || []).map(String);
  for (const courseId of courses) {
    const allowed = new Set((courseTeachers?.[courseId] || []).map((teacher) => String(teacher._id)));
    for (const teacherId of teachers) {
      if (allowed.has(teacherId)) pairs.push({ courseId, teacherId });
    }
  }
  return pairs;
};

export const LmsTargetSelect = ({
  courses,
  teachers,
  courseTeachers,
  selectedCourseIds,
  selectedTeacherIds,
  onCoursesChange,
  onTeachersChange,
  previewNoun,
  requireTeachers = true,
}) => {
  const allCourseIds = courses.map((course) => String(course._id));
  const allTeacherIds = teachers.map((teacher) => String(teacher._id));
  const allCoursesSelected =
    allCourseIds.length > 0 && allCourseIds.every((id) => selectedCourseIds.includes(id));
  const allTeachersSelected =
    allTeacherIds.length > 0 && allTeacherIds.every((id) => selectedTeacherIds.includes(id));
  const pairCount = requireTeachers
    ? computeTargetPairs(selectedCourseIds, selectedTeacherIds, courseTeachers).length
    : selectedCourseIds.length;

  return (
    <div className="lms-target-select">
      <div className="lms-target-select__group">
        <div className="lms-target-select__head">
          <span>Courses *</span>
          <label className="lms-checkbox-field lms-target-select__select-all">
            <input
              type="checkbox"
              checked={allCoursesSelected}
              onChange={() => onCoursesChange(allCoursesSelected ? [] : allCourseIds)}
            />
            <span>Select all</span>
          </label>
        </div>
        <div className="lms-target-select__grid">
          {courses.map((course) => {
            const id = String(course._id);
            return (
              <label key={id} className="lms-checkbox-field lms-target-select__item">
                <input
                  type="checkbox"
                  checked={selectedCourseIds.includes(id)}
                  onChange={() =>
                    onCoursesChange(
                      selectedCourseIds.includes(id)
                        ? selectedCourseIds.filter((selectedId) => selectedId !== id)
                        : [...selectedCourseIds, id]
                    )
                  }
                />
                <span>{course.title}</span>
              </label>
            );
          })}
        </div>
      </div>
      {requireTeachers ? (
        <div className="lms-target-select__group">
          <div className="lms-target-select__head">
            <span>Teachers *</span>
            <label className="lms-checkbox-field lms-target-select__select-all">
              <input
                type="checkbox"
                checked={allTeachersSelected}
                onChange={() => onTeachersChange(allTeachersSelected ? [] : allTeacherIds)}
              />
              <span>Select all</span>
            </label>
          </div>
          <div className="lms-target-select__grid">
            {teachers.map((teacher) => {
              const id = String(teacher._id);
              return (
                <label key={id} className="lms-checkbox-field lms-target-select__item">
                  <input
                    type="checkbox"
                    checked={selectedTeacherIds.includes(id)}
                    onChange={() =>
                      onTeachersChange(
                        selectedTeacherIds.includes(id)
                          ? selectedTeacherIds.filter((selectedId) => selectedId !== id)
                          : [...selectedTeacherIds, id]
                      )
                    }
                  />
                  <span>{teacher.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
      <p className="lms-target-select__preview">
        {pairCount > 0 ? (
          <>
            <i className="fas fa-check-circle" aria-hidden="true" /> {pairCount} {previewNoun}
            {pairCount === 1 ? '' : 's'} will be published (valid course + teacher pairs only)
          </>
        ) : (
          <>
            <i className="fas fa-info-circle" aria-hidden="true" /> Select courses
            {requireTeachers ? ' and teachers' : ''} — only matching pairs are published
          </>
        )}
      </p>
    </div>
  );
};
