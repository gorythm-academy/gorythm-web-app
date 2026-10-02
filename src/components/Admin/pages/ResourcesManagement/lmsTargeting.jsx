import React from 'react';
import { toLocalDateStr } from '../../../../utils/academyWeek';
import { formatScheduleLabel } from '../../../../utils/formatScheduleLabel';

export const minDueDateValue = () => toLocalDateStr(new Date());

/** Minimum date when editing — same due date allowed; only earlier dates are blocked. */
export const minEditDueDateValue = (currentDueDate) => {
  if (!currentDueDate) return minDueDateValue();
  const base = new Date(currentDueDate);
  if (Number.isNaN(base.getTime())) return minDueDateValue();
  return toLocalDateStr(base);
};

/** @deprecated Use minEditDueDateValue — kept for callers expecting the old export name. */
export const minExtendDueDateValue = minEditDueDateValue;

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

export const filterSchedulesForTargeting = (schedules, selectedCourseIds, selectedTeacherIds) => {
  const courseSet = new Set((selectedCourseIds || []).map(String));
  const teacherSet = new Set((selectedTeacherIds || []).map(String));
  return (schedules || []).filter((slot) => {
    const courseId = String(slot.course?._id || slot.course || '');
    const teacherId = String(slot.teacher?._id || slot.teacher || '');
    if (courseSet.size && !courseSet.has(courseId)) return false;
    if (teacherSet.size && !teacherSet.has(teacherId)) return false;
    return true;
  });
};

export const computeTargetSchedules = (selectedCourseIds, selectedTeacherIds, selectedScheduleIds, schedules) => {
  const selected = new Set((selectedScheduleIds || []).map(String));
  return filterSchedulesForTargeting(schedules, selectedCourseIds, selectedTeacherIds).filter((slot) =>
    selected.has(String(slot._id))
  );
};

export const LmsTargetSelect = ({
  courses,
  teachers,
  schedules,
  courseTeachers,
  selectedCourseIds,
  selectedTeacherIds,
  selectedScheduleIds,
  onCoursesChange,
  onTeachersChange,
  onSchedulesChange,
  previewNoun,
  requireTeachers = true,
  requireSchedules = true,
}) => {
  const allCourseIds = courses.map((course) => String(course._id));
  const allTeacherIds = teachers.map((teacher) => String(teacher._id));
  const visibleSchedules = filterSchedulesForTargeting(schedules, selectedCourseIds, selectedTeacherIds);
  const allScheduleIds = visibleSchedules.map((slot) => String(slot._id));
  const allCoursesSelected =
    allCourseIds.length > 0 && allCourseIds.every((id) => selectedCourseIds.includes(id));
  const allTeachersSelected =
    allTeacherIds.length > 0 && allTeacherIds.every((id) => selectedTeacherIds.includes(id));
  const allSchedulesSelected =
    allScheduleIds.length > 0 && allScheduleIds.every((id) => selectedScheduleIds.includes(id));
  const scheduleCount = computeTargetSchedules(
    selectedCourseIds,
    selectedTeacherIds,
    selectedScheduleIds,
    schedules
  ).length;
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
      {requireSchedules ? (
        <div className="lms-target-select__group">
          <div className="lms-target-select__head">
            <span>Class slots *</span>
            {allScheduleIds.length ? (
              <label className="lms-checkbox-field lms-target-select__select-all">
                <input
                  type="checkbox"
                  checked={allSchedulesSelected}
                  onChange={() => onSchedulesChange(allSchedulesSelected ? [] : allScheduleIds)}
                />
                <span>Select all</span>
              </label>
            ) : null}
          </div>
          {visibleSchedules.length ? (
            <div className="lms-target-select__grid">
              {visibleSchedules.map((slot) => {
                const id = String(slot._id);
                const courseTitle = slot.course?.title ? `${slot.course.title} · ` : '';
                return (
                  <label key={id} className="lms-checkbox-field lms-target-select__item">
                    <input
                      type="checkbox"
                      checked={selectedScheduleIds.includes(id)}
                      onChange={() =>
                        onSchedulesChange(
                          selectedScheduleIds.includes(id)
                            ? selectedScheduleIds.filter((selectedId) => selectedId !== id)
                            : [...selectedScheduleIds, id]
                        )
                      }
                    />
                    <span>
                      {courseTitle}
                      {formatScheduleLabel(slot)}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="lms-target-select__preview">
              <i className="fas fa-info-circle" aria-hidden="true" /> Select courses and teachers to see matching class
              slots, or add slots in LMS → Class Schedules.
            </p>
          )}
        </div>
      ) : null}
      <p className="lms-target-select__preview">
        {requireSchedules ? (
          scheduleCount > 0 ? (
            <>
              <i className="fas fa-check-circle" aria-hidden="true" /> {scheduleCount} {previewNoun}
              {scheduleCount === 1 ? '' : 's'} will be published (one per selected class slot)
            </>
          ) : (
            <>
              <i className="fas fa-info-circle" aria-hidden="true" /> Select at least one class slot
              {requireTeachers && pairCount > 0 ? ` (${pairCount} course+teacher pair${pairCount === 1 ? '' : 's'} match filters)` : ''}
            </>
          )
        ) : pairCount > 0 ? (
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
