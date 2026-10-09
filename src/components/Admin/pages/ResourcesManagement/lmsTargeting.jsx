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

const slotCourseId = (slot) => String(slot?.course?._id || slot?.course || '');
const slotTeacherId = (slot) => String(slot?.teacher?._id || slot?.teacher || '');

const teacherIdsForCourses = (courseIds, courseTeachers, schedules) => {
  const allowed = new Set();
  const courseSet = new Set((courseIds || []).map(String));
  courseSet.forEach((courseId) => {
    (courseTeachers?.[courseId] || []).forEach((teacher) => {
      if (teacher?._id) allowed.add(String(teacher._id));
    });
  });
  (schedules || []).forEach((slot) => {
    if (!courseSet.has(slotCourseId(slot))) return;
    const teacherId = slotTeacherId(slot);
    if (teacherId) allowed.add(teacherId);
  });
  return allowed;
};

const courseIdsForTeachers = (teacherIds, courses, courseTeachers, schedules) => {
  const teacherSet = new Set((teacherIds || []).map(String));
  const allowed = new Set();
  (courses || []).forEach((course) => {
    const courseId = String(course._id);
    const linked = (courseTeachers?.[courseId] || []).some((teacher) => teacherSet.has(String(teacher._id)));
    if (linked) allowed.add(courseId);
  });
  (schedules || []).forEach((slot) => {
    if (teacherSet.has(slotTeacherId(slot))) allowed.add(slotCourseId(slot));
  });
  return allowed;
};

export const filterSchedulesForTargeting = (schedules, selectedCourseIds, selectedTeacherIds) => {
  const courseSet = new Set((selectedCourseIds || []).map(String));
  const teacherSet = new Set((selectedTeacherIds || []).map(String));
  return (schedules || []).filter((slot) => {
    const courseId = slotCourseId(slot);
    const teacherId = slotTeacherId(slot);
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
  showSchedules = false,
  linkSelections = false,
}) => {
  const scheduleById = new Map((schedules || []).map((slot) => [String(slot._id), slot]));
  const selectedSlots = (selectedScheduleIds || [])
    .map((id) => scheduleById.get(String(id)))
    .filter(Boolean);

  const visibleCourses = courses.filter((course) => {
    if (!linkSelections) return true;
    const courseId = String(course._id);
    if (selectedTeacherIds.length) {
      const allowed = courseIdsForTeachers(selectedTeacherIds, courses, courseTeachers, schedules);
      if (!allowed.has(courseId)) return false;
    }
    if (selectedSlots.length) {
      const allowed = new Set(selectedSlots.map(slotCourseId));
      if (!allowed.has(courseId)) return false;
    }
    return true;
  });
  const visibleTeachers = teachers.filter((teacher) => {
    if (!linkSelections) return true;
    const teacherId = String(teacher._id);
    if (selectedCourseIds.length) {
      const allowed = teacherIdsForCourses(selectedCourseIds, courseTeachers, schedules);
      if (!allowed.has(teacherId)) return false;
    }
    if (selectedSlots.length) {
      const allowed = new Set(selectedSlots.map(slotTeacherId));
      if (!allowed.has(teacherId)) return false;
    }
    return true;
  });
  const allCourseIds = visibleCourses.map((course) => String(course._id));
  const allTeacherIds = visibleTeachers.map((teacher) => String(teacher._id));
  const visibleSchedules = filterSchedulesForTargeting(schedules, selectedCourseIds, selectedTeacherIds);
  const slotsVisible = requireSchedules || showSchedules;

  const sameIds = (left, right) => left.length === right.length && left.every((id, index) => id === right[index]);

  const commit = (kind, nextIds) => {
    if (!linkSelections) {
      if (kind === 'courses') onCoursesChange(nextIds);
      else if (kind === 'teachers') onTeachersChange(nextIds);
      else onSchedulesChange(nextIds);
      return;
    }
    let courseIds = (kind === 'courses' ? nextIds : selectedCourseIds).map(String);
    let teacherIds = (kind === 'teachers' ? nextIds : selectedTeacherIds).map(String);
    let scheduleIds = (kind === 'schedules' ? nextIds : selectedScheduleIds).map(String);

    if (kind !== 'teachers' && courseIds.length) {
      const allowed = teacherIdsForCourses(courseIds, courseTeachers, schedules);
      teacherIds = teacherIds.filter((id) => allowed.has(id));
    }
    if (kind !== 'courses' && teacherIds.length) {
      const allowed = courseIdsForTeachers(teacherIds, courses, courseTeachers, schedules);
      courseIds = courseIds.filter((id) => allowed.has(id));
    }
    if (kind === 'schedules' && scheduleIds.length) {
      const slots = scheduleIds.map((id) => scheduleById.get(id)).filter(Boolean);
      const allowedCourses = new Set(slots.map(slotCourseId));
      const allowedTeachers = new Set(slots.map(slotTeacherId));
      courseIds = courseIds.filter((id) => allowedCourses.has(id));
      teacherIds = teacherIds.filter((id) => allowedTeachers.has(id));
    }
    if (kind !== 'schedules') {
      scheduleIds = scheduleIds.filter((id) => {
        const slot = scheduleById.get(id);
        if (!slot) return false;
        if (courseIds.length && !courseIds.includes(slotCourseId(slot))) return false;
        if (teacherIds.length && !teacherIds.includes(slotTeacherId(slot))) return false;
        return true;
      });
    }
    const currentCourses = selectedCourseIds.map(String);
    const currentTeachers = selectedTeacherIds.map(String);
    const currentSchedules = selectedScheduleIds.map(String);
    if (!sameIds(courseIds, currentCourses)) onCoursesChange(courseIds);
    if (!sameIds(teacherIds, currentTeachers)) onTeachersChange(teacherIds);
    if (!sameIds(scheduleIds, currentSchedules)) onSchedulesChange(scheduleIds);
  };

  const toggleId = (kind, id) => {
    const current = (kind === 'courses' ? selectedCourseIds : kind === 'teachers' ? selectedTeacherIds : selectedScheduleIds).map(String);
    const next = current.includes(String(id)) ? current.filter((selectedId) => selectedId !== String(id)) : [...current, String(id)];
    commit(kind, next);
  };
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
              onChange={() => commit('courses', allCoursesSelected ? [] : allCourseIds)}
            />
            <span>Select all</span>
          </label>
        </div>
        <div className="lms-target-select__grid">
          {visibleCourses.map((course) => {
            const id = String(course._id);
            return (
              <label key={id} className="lms-checkbox-field lms-target-select__item">
                <input
                  type="checkbox"
                  checked={selectedCourseIds.includes(id)}
                  onChange={() => toggleId('courses', id)}
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
                onChange={() => commit('teachers', allTeachersSelected ? [] : allTeacherIds)}
              />
              <span>Select all</span>
            </label>
          </div>
          <div className="lms-target-select__grid">
            {visibleTeachers.map((teacher) => {
              const id = String(teacher._id);
              return (
                <label key={id} className="lms-checkbox-field lms-target-select__item">
                  <input
                    type="checkbox"
                    checked={selectedTeacherIds.includes(id)}
                    onChange={() => toggleId('teachers', id)}
                  />
                  <span>{teacher.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
      {slotsVisible ? (
        <div className="lms-target-select__group">
          <div className="lms-target-select__head">
            <span>Class slots *</span>
            {allScheduleIds.length ? (
              <label className="lms-checkbox-field lms-target-select__select-all">
                <input
                  type="checkbox"
                  checked={allSchedulesSelected}
                  onChange={() => commit('schedules', allSchedulesSelected ? [] : allScheduleIds)}
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
                      onChange={() => toggleId('schedules', id)}
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
              <i className="fas fa-info-circle" aria-hidden="true" />{' '}
              {linkSelections && (schedules || []).length
                ? 'No class slots match this selection.'
                : 'Select courses and teachers to see matching class slots, or add slots in LMS → Class Schedules.'}
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
