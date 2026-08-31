import React from 'react';
import RequiredMark from '../../../shared/RequiredMark';
import ScheduleRoomOrLink from '../../../Portals/shared/ScheduleRoomOrLink';
import { formatTime12h } from '../../../../utils/formatTime12h';
import AdminSearchBox from '../../shared/AdminSearchBox';
import LmsPanelLoading from './LmsPanelLoading';

const SchedulesTab = ({
  panelId,
  editingScheduleId,
  scheduleForm,
  setScheduleForm,
  saveSchedule,
  scheduleCourseOptions,
  teachers,
  dayOptions,
  timezoneOptions,
  resetScheduleForm,
  scheduleListSearch,
  scheduleListCourseFilter,
  setScheduleListCourseFilter,
  schedulesLoading,
  filteredSchedules,
  schedules,
  selectedScheduleIds,
  setSelectedScheduleIds,
  scheduleBulkBusy,
  removeSelectedSchedules,
  toggleScheduleSelection,
  startEditSchedule,
  removeSchedule,
}) => (
  <section
    className="lms-panel lms-schedules-panel"
    role="tabpanel"
    id={panelId}
    aria-labelledby="lms-tab-schedules"
  >
    <div className="lms-schedule-layout">
      <div className={`lms-schedule-form-card${editingScheduleId ? ' lms-schedule-form-card--editing' : ''}`}>
        <header className="lms-schedule-form-card__head">
          <span className="lms-schedule-form-card__icon" aria-hidden="true">
            <i className={`fas ${editingScheduleId ? 'fa-pen' : 'fa-plus'}`} />
          </span>
          <div>
            <h2>{editingScheduleId ? 'Edit Class Schedule' : 'Add Class Schedule'}</h2>
            <p>One row = one weekly time slot with a teacher for a course.</p>
          </div>
        </header>
        <form className="lms-schedule-form-grid" onSubmit={saveSchedule}>
          <label className="lms-schedule-field lms-schedule-field--full">
            <span><i className="fas fa-book" /> Course <RequiredMark /></span>
            <select
              value={scheduleForm.courseId}
              onChange={(e) =>
                setScheduleForm({ ...scheduleForm, courseId: e.target.value, teacherId: '' })
              }
              required
            >
              <option value="">Select course…</option>
              {scheduleCourseOptions.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="lms-schedule-field lms-schedule-field--full">
            <span><i className="fas fa-chalkboard-teacher" /> Teacher</span>
            <select
              value={scheduleForm.teacherId}
              onChange={(e) => setScheduleForm({ ...scheduleForm, teacherId: e.target.value })}
              disabled={!scheduleForm.courseId}
            >
              <option value="">
                {scheduleForm.courseId
                  ? 'Default to course instructor'
                  : 'Select a course first'}
              </option>
              {teachers.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name} ({t.email})
                </option>
              ))}
            </select>
          </label>
          <label className="lms-schedule-field">
            <span><i className="fas fa-calendar-day" /> Day</span>
            <select
              value={scheduleForm.dayOfWeek}
              onChange={(e) =>
                setScheduleForm({ ...scheduleForm, dayOfWeek: Number(e.target.value) })
              }
            >
              {dayOptions.map((label, i) => (
                <option key={label} value={i}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="lms-schedule-field">
            <span><i className="fas fa-clock" /> Start <RequiredMark /></span>
            <input
              type="time"
              value={scheduleForm.startTime}
              onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
              required
            />
          </label>
          <label className="lms-schedule-field">
            <span><i className="fas fa-clock" /> End <RequiredMark /></span>
            <input
              type="time"
              value={scheduleForm.endTime}
              onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })}
              required
            />
          </label>
          <label className="lms-schedule-field lms-schedule-field--full">
            <span><i className="fas fa-globe" /> Timezone</span>
            <select
              value={scheduleForm.timezone}
              onChange={(e) => setScheduleForm({ ...scheduleForm, timezone: e.target.value })}
            >
              {timezoneOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
          <label className="lms-schedule-field lms-schedule-field--full">
            <span><i className="fas fa-link" /> Room or Meeting Link</span>
            <input
              type="text"
              placeholder="Room 2 or https://meet…"
              value={scheduleForm.roomOrLink}
              onChange={(e) => setScheduleForm({ ...scheduleForm, roomOrLink: e.target.value })}
            />
          </label>
          <div className="lms-schedule-form-actions lms-schedule-field--full">
            <button type="submit" className={`lms-schedule-btn-primary ${editingScheduleId ? 'btn-save' : 'btn-add'}`}>
              <i className={`fas ${editingScheduleId ? 'fa-save' : 'fa-plus'}`} />
              {editingScheduleId ? 'Save changes' : 'Add schedule'}
            </button>
            {editingScheduleId ? (
              <button type="button" className="lms-schedule-btn-secondary" onClick={resetScheduleForm}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="lms-schedule-board">
        <div className="lms-schedule-board__head">
          <div className="lms-schedule-board__title">
            <span className="lms-schedule-board__icon" aria-hidden="true">
              <i className="fa-solid fa-calendar-days" />
            </span>
            <div>
              <h3>Class Schedule List</h3>
              <p>Filter by course, select rows, and remove in bulk.</p>
            </div>
          </div>
        </div>
        <div className="controls-bar lms-schedule-board__controls">
          <AdminSearchBox
            placeholder="Course, teacher, day, time, room…"
            value={scheduleListSearch.searchTerm}
            onChange={(e) => scheduleListSearch.setSearchTerm(e.target.value)}
            onEnter={() => scheduleListSearch.flushSearch()}
          />
          <div className="filter-controls">
            <label className="lms-field-label lms-schedule-board__filter">
              <span>View by Course</span>
              <select
                value={scheduleListCourseFilter}
                onChange={(e) => setScheduleListCourseFilter(e.target.value)}
              >
                <option value="all">All courses</option>
                {scheduleCourseOptions.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {schedulesLoading ? (
          <LmsPanelLoading label="Loading class schedules…" />
        ) : filteredSchedules.length === 0 ? (
          <div className="lms-schedule-board__empty">
            <i className="fas fa-calendar-xmark" />
            <p>
              {schedules.length === 0
                ? 'No class timings for this selection. Add one using the form.'
                : 'No schedules match your search.'}
            </p>
          </div>
        ) : (
          <>
            <div className="lms-schedule-board__meta">
              <span className="lms-schedule-board__count">
                {filteredSchedules.length} slot{filteredSchedules.length === 1 ? '' : 's'}
                {scheduleListSearch.debouncedSearch && schedules.length !== filteredSchedules.length
                  ? ` (of ${schedules.length})`
                  : ''}
              </span>
            </div>
            {selectedScheduleIds.length > 0 ? (
              <div className="lms-schedule-bulk-bar">
                <span className="lms-schedule-bulk-bar__count">
                  <i className="fas fa-check-circle" />
                  {selectedScheduleIds.length} selected
                </span>
                <div className="lms-schedule-bulk-bar__actions">
                  <button
                    type="button"
                    className="lms-schedule-bulk-bar__delete"
                    disabled={scheduleBulkBusy}
                    onClick={removeSelectedSchedules}
                  >
                    <i className="fas fa-trash" /> Remove selected
                  </button>
                  <button
                    type="button"
                    className="lms-schedule-bulk-bar__clear"
                    disabled={scheduleBulkBusy}
                    onClick={() => setSelectedScheduleIds([])}
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : null}
            <div className="lms-schedule-table-wrap">
              <table className="lms-schedule-table">
                <thead>
                  <tr>
                    <th className="lms-schedule-table__check">
                      <input
                        type="checkbox"
                        aria-label="Select all schedules"
                        checked={
                          filteredSchedules.length > 0 &&
                          filteredSchedules.every((s) => selectedScheduleIds.includes(s._id))
                        }
                        onChange={() => {
                          if (
                            filteredSchedules.length > 0 &&
                            filteredSchedules.every((s) => selectedScheduleIds.includes(s._id))
                          ) {
                            setSelectedScheduleIds([]);
                          } else {
                            setSelectedScheduleIds(filteredSchedules.map((s) => s._id));
                          }
                        }}
                      />
                    </th>
                    <th>Day</th>
                    <th>Time</th>
                    <th>Timezone</th>
                    <th>Course</th>
                    <th>Teacher</th>
                    <th>Room / Link</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSchedules.map((s) => (
                    <tr
                      key={s._id}
                      className={[
                        editingScheduleId === s._id ? 'lms-schedule-row--editing' : '',
                        selectedScheduleIds.includes(s._id) ? 'lms-schedule-row--selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <td className="lms-schedule-table__check">
                        <input
                          type="checkbox"
                          aria-label={`Select ${s.course?.title || 'schedule'}`}
                          checked={selectedScheduleIds.includes(s._id)}
                          onChange={() => toggleScheduleSelection(s._id)}
                        />
                      </td>
                      <td>
                        <span className="lms-schedule-day-badge">
                          {dayOptions[s.dayOfWeek] || s.dayOfWeek}
                        </span>
                      </td>
                      <td className="lms-schedule-time">
                        {formatTime12h(s.startTime)} – {formatTime12h(s.endTime)}
                      </td>
                      <td className="lms-schedule-timezone">{s.timezone || 'UTC'}</td>
                      <td className="lms-schedule-course">{s.course?.title || '—'}</td>
                      <td className="lms-schedule-teacher">
                        <span className="lms-schedule-teacher__name">
                          {s.teacher?.name || '—'}
                        </span>
                        {s.teacher?.email ? (
                          <small className="admin-email">{s.teacher.email}</small>
                        ) : null}
                      </td>
                      <td>
                        <ScheduleRoomOrLink
                          value={s.roomOrLink}
                          className="lms-schedule-link"
                        />
                      </td>
                      <td className="lms-list-actions">
                        <button
                          type="button"
                          className="lms-schedule-action lms-schedule-action--edit"
                          title="Edit"
                          onClick={() => startEditSchedule(s)}
                        >
                          <i className="fas fa-pen" />
                        </button>
                        <button
                          type="button"
                          className="lms-schedule-action lms-schedule-action--delete"
                          title="Remove"
                          onClick={() => removeSchedule(s._id)}
                        >
                          <i className="fas fa-trash" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  </section>
);

export default SchedulesTab;
