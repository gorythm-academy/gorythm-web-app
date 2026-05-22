import React, { useEffect, useState } from 'react';
import { portalGet, portalPost, portalPatch, portalDelete } from '../shared/portalApi';
import { PortalAlert, PortalPageHeader, SimpleTable } from '../shared/PortalUi';
import ScheduleWeekView from '../shared/ScheduleWeekView';
import { portalDocId } from '../../../utils/portalDocId';

const EMPTY = {
  courseId: '',
  dayOfWeek: 1,
  startTime: '09:00',
  endTime: '10:00',
  roomOrLink: '',
};

const TeacherSchedule = () => {
  const [schedules, setSchedules] = useState([]);
  const [courses, setCourses] = useState([]);
  const [dayLabels, setDayLabels] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState('');

  const load = () => {
    portalGet('/teacher/schedule').then((res) => {
      if (res.success) {
        setSchedules(res.schedules || []);
        setDayLabels(res.dayLabels || []);
      }
    });
  };

  useEffect(() => {
    portalGet('/teacher/courses').then((res) => {
      if (res.success) setCourses(res.courses || []);
    });
    load();
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    const body = { ...form, dayOfWeek: Number(form.dayOfWeek) };
    try {
      if (editingId) {
        await portalPatch(`/teacher/schedule/${editingId}`, body);
        setMsg('Schedule updated.');
      } else {
        await portalPost('/teacher/schedule', body);
        setMsg('Schedule added.');
      }
      setForm(EMPTY);
      setEditingId(null);
      load();
    } catch (err) {
      setMsg(err.message || 'Failed');
    }
  };

  const startEdit = (s) => {
    const id = portalDocId(s);
    if (!id) setMsg('Schedule slot id missing.');
    setEditingId(id || null);
    setForm({
      courseId: String(s.course?._id || s.course || ''),
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      roomOrLink: s.roomOrLink || '',
    });
  };

  const remove = async (s) => {
    if (!window.confirm('Delete this schedule slot?')) return;
    try {
      await portalDelete(`/teacher/schedule/${portalDocId(s)}`);
      setMsg('Deleted.');
      load();
    } catch (err) {
      setMsg(err.message || 'Failed');
    }
  };

  return (
    <div className="portal-page">
      <PortalPageHeader title="Class schedule" />
      <section className="portal-content-section">
        <h2 className="portal-content-section-title">{editingId ? 'Edit slot' : 'Add class slot'}</h2>
        <form className="portal-card portal-form-card" onSubmit={save}>
          <select
            value={form.courseId}
            onChange={(e) => setForm({ ...form, courseId: e.target.value })}
            required
          >
            <option value="">Course</option>
            {courses.map((c) => (
              <option key={c._id} value={c._id}>
                {c.title}
              </option>
            ))}
          </select>
          <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}>
            {dayLabels.map((label, i) => (
              <option key={label} value={i}>
                {label}
              </option>
            ))}
          </select>
          <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
          <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
          <input
            placeholder="Room or online meeting link"
            value={form.roomOrLink}
            onChange={(e) => setForm({ ...form, roomOrLink: e.target.value })}
          />
          <button type="submit">{editingId ? 'Save' : 'Add slot'}</button>
        </form>
      </section>
      {msg ? <PortalAlert type="info">{msg}</PortalAlert> : null}
      <ScheduleWeekView schedules={schedules} dayLabels={dayLabels} />
      <section className="portal-content-section">
        <h2 className="portal-content-section-title">All slots</h2>
        <SimpleTable
          columns={[
            { key: 'day', label: 'Day', render: (r) => dayLabels[r.dayOfWeek] },
            { key: 'time', label: 'Time', render: (r) => `${r.startTime} – ${r.endTime}` },
            { key: 'course', label: 'Course', render: (r) => r.course?.title },
            { key: 'room', label: 'Room / link', render: (r) => r.roomOrLink || '—' },
            {
              key: 'actions',
              label: 'Actions',
              render: (r) => (
                <div className="portal-table-actions">
                  <button type="button" onClick={() => startEdit(r)}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => remove(r)}>
                    Delete
                  </button>
                </div>
              ),
            },
          ]}
          rows={schedules}
          emptyLabel="No schedule entries."
        />
      </section>
    </div>
  );
};

export default TeacherSchedule;
