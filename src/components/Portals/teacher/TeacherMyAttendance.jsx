import React, { useEffect, useState, useCallback } from 'react';
import { portalGet, portalPost } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader, SimpleTable } from '../shared/PortalUi';
import { TEACHER_MY_STATUS_OPTIONS } from '../../../constants/attendanceStatuses';
import './TeacherMyAttendance.scss';

const formatDisplayDate = (isoDate) => {
  if (!isoDate) return '';
  try {
    return new Date(`${isoDate}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
};

const currentMonthKey = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};

const TeacherMyAttendance = () => {
  const [monthlyRecords, setMonthlyRecords] = useState([]);
  const [viewMonth, setViewMonth] = useState(currentMonthKey());
  const [calendarDays, setCalendarDays] = useState([]);
  const [expectedWorkingDays, setExpectedWorkingDays] = useState(0);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedDayMeta, setSelectedDayMeta] = useState(null);
  const [status, setStatus] = useState('present');
  const [notes, setNotes] = useState('');
  const [existingForDay, setExistingForDay] = useState(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingDay, setLoadingDay] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadMonthly = useCallback((month) => {
    const q = month ? `?month=${encodeURIComponent(month)}` : '';
    portalGet(`/teacher/my-attendance${q}`).then((res) => {
      if (!res.success) return;
      setMonthlyRecords(res.monthlyRecords || []);
      if (res.monthCalendar?.days) {
        setCalendarDays(res.monthCalendar.days);
        setExpectedWorkingDays(res.monthCalendar.expectedWorkingDays ?? 0);
        if (res.viewMonth) setViewMonth(res.viewMonth);
      }
    });
  }, []);

  const loadDayForDate = useCallback((dateStr) => {
    if (!dateStr) {
      setExistingForDay(null);
      setSelectedDayMeta(null);
      setStatus('present');
      setNotes('');
      return;
    }
    setLoadingDay(true);
    portalGet(`/teacher/my-attendance?date=${encodeURIComponent(dateStr)}&month=${viewMonth}`)
      .then((res) => {
        if (!res.success) return;
        const rec = res.selectedDayRecord;
        setExistingForDay(rec || null);
        setSelectedDayMeta(res.selectedDayMeta || null);
        if (res.monthCalendar?.days) {
          setCalendarDays(res.monthCalendar.days);
          setExpectedWorkingDays(res.monthCalendar.expectedWorkingDays ?? 0);
        }
        if (rec) {
          setStatus(rec.status || 'present');
          setNotes(rec.notes || '');
        } else {
          setStatus('present');
          setNotes('');
        }
      })
      .finally(() => setLoadingDay(false));
  }, [viewMonth]);

  useEffect(() => {
    loadMonthly(viewMonth);
    setLoading(false);
  }, [loadMonthly, viewMonth]);

  useEffect(() => {
    loadDayForDate(selectedDate);
  }, [selectedDate, loadDayForDate]);

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
    setMsg('');
  };

  const pickCalendarDay = (day) => {
    if (!day?.date) return;
    setSelectedDate(day.date);
    setMsg('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!selectedDate) {
      setMsg('Please select a date first.');
      return;
    }
    setMsg('');
    setSubmitting(true);
    try {
      const res = await portalPost('/teacher/my-attendance', {
        date: selectedDate,
        status,
        notes,
      });
      if (res.success) {
        setMsg(
          res.message ||
            `Daily attendance saved for ${formatDisplayDate(selectedDate)} and sent to admin for approval.`
        );
        setMonthlyRecords(res.monthlyRecords || []);
        setExistingForDay(res.record || null);
        loadMonthly(viewMonth);
        loadDayForDate(selectedDate);
      } else {
        setMsg(res.error || 'Failed');
      }
    } catch {
      setMsg('Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const showMarkingPanel = Boolean(selectedDate);
  const maxDate = new Date().toISOString().slice(0, 10);

  if (loading) {
    return (
      <div className="portal-page teacher-my-attendance">
        <PortalLoading />
      </div>
    );
  }

  return (
    <div className="portal-page teacher-my-attendance">
      <PortalPageHeader
        title="My attendance"
        subtitle="Choose status per day. Holiday and weekend count in reports but do not reduce your salary."
      />

      <section className="my-attendance-calendar-section">
        <div className="my-attendance-calendar-head">
          <h3>Month overview</h3>
          <label>
            Month
            <input
              type="month"
              value={viewMonth}
              onChange={(e) => {
                setViewMonth(e.target.value);
                loadMonthly(e.target.value);
              }}
            />
          </label>
        </div>
        <p className="my-attendance-calendar-meta">
          <i className="fas fa-briefcase" /> {expectedWorkingDays} working day
          {expectedWorkingDays === 1 ? '' : 's'} this month (weekends &amp; holidays excluded)
        </p>
        <div className="my-attendance-calendar-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="my-attendance-calendar-dow">
              {d}
            </div>
          ))}
          {calendarDays.length
            ? Array(new Date(`${calendarDays[0].date}T12:00:00`).getDay())
                .fill(null)
                .map((_, i) => <div key={`pad-${i}`} className="my-attendance-cal-day my-attendance-cal-day--pad" />)
            : null}
          {calendarDays.map((day) => {
            const dayNum = day.date?.slice(8, 10);
            const typeClass = `my-attendance-cal-day--${day.dayType || 'working'}`;
            const marked = day.mark?.status;
            return (
              <button
                key={day.date}
                type="button"
                className={`my-attendance-cal-day ${typeClass} ${
                  selectedDate === day.date ? 'is-selected' : ''
                } ${marked ? `is-marked is-marked--${marked}` : ''}`}
                onClick={() => pickCalendarDay(day)}
                title={day.label}
              >
                <span className="my-attendance-cal-day__num">{Number(dayNum)}</span>
                {marked ? (
                  <span className="my-attendance-cal-day__dot" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="my-attendance-calendar-legend">
          <span className="my-attendance-cal-day--working">Working</span>
          <span className="my-attendance-cal-day--weekend">Weekend</span>
          <span className="my-attendance-cal-day--holiday">Holiday</span>
        </div>
      </section>

      <form className="my-attendance-daily-card" onSubmit={submit}>
        <div className="my-attendance-daily-card__head">
          <div className="my-attendance-daily-card__icon" aria-hidden="true">
            <i className="fas fa-calendar-day" />
          </div>
          <div>
            <h3>Daily attendance</h3>
            <p>Pick a date from the calendar or the field below.</p>
          </div>
        </div>

        <div className="my-attendance-date-picker">
          <label htmlFor="my-attendance-date">Which day?</label>
          <input
            id="my-attendance-date"
            type="date"
            value={selectedDate}
            onChange={handleDateChange}
            max={maxDate}
            required
          />
        </div>

        {showMarkingPanel ? (
          <div className="my-attendance-mark-panel">
            {loadingDay ? (
              <p className="my-attendance-date-hint">
                <i className="fas fa-spinner fa-spin" /> Loading this day…
              </p>
            ) : (
              <>
                <div className="my-attendance-selected-date">
                  <i className="fas fa-calendar-check" />
                  {formatDisplayDate(selectedDate)}
                  {existingForDay ? (
                    <span style={{ marginLeft: 8, fontWeight: 500, opacity: 0.85 }}>
                      (already marked — update below)
                    </span>
                  ) : null}
                </div>

                {selectedDayMeta && !selectedDayMeta.isWorking ? (
                  <p className="my-attendance-date-hint">
                    Calendar shows {selectedDayMeta.label.toLowerCase()} — pick <strong>Holiday</strong> or{' '}
                    <strong>Weekend</strong> if applicable (no salary deduction).
                  </p>
                ) : null}
                <p className="portal-field-label" style={{ marginBottom: '0.5rem' }}>
                  Your status for this day
                </p>
                <div className="my-attendance-status-grid my-attendance-status-grid--six">
                  {TEACHER_MY_STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`my-attendance-status-card ${status === opt.value ? 'is-active' : ''}`}
                      style={{ '--status-color': opt.color }}
                      onClick={() => setStatus(opt.value)}
                      disabled={submitting}
                    >
                      <i className={`fas ${opt.icon}`} style={{ color: opt.color }} />
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="my-attendance-notes">
                  <label htmlFor="my-attendance-notes">Notes (optional)</label>
                  <textarea
                    id="my-attendance-notes"
                    placeholder="Reason for leave, late arrival, etc."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={submitting}
                  />
                </div>

                <button
                  type="submit"
                  className="my-attendance-save-btn"
                  disabled={submitting || loadingDay}
                >
                  <i className={`fas ${submitting ? 'fa-spinner fa-spin' : 'fa-save'}`} />
                  {submitting ? 'Saving…' : existingForDay ? 'Update this day' : 'Save daily attendance'}
                </button>
              </>
            )}
          </div>
        ) : null}
      </form>

      {msg ? <PortalAlert type="success">{msg}</PortalAlert> : null}

      <section className="portal-content-section my-attendance-records-section">
        <h2 className="portal-content-section-title">Monthly attendance (records)</h2>
        <p style={{ margin: '0 0 1rem', fontSize: '0.88rem', color: '#64748b' }}>
          Summaries by month for admin approval. Only working days count toward leave and absent totals.
        </p>
        <SimpleTable
          columns={[
            { key: 'month', label: 'Month', render: (r) => r.monthKey },
            { key: 'working', label: 'Working days', render: (r) => r.expectedWorkingDays ?? '—' },
            { key: 'present', label: 'Present', render: (r) => r.presentDays },
            { key: 'leave', label: 'Leave', render: (r) => r.leaveDays },
            { key: 'absent', label: 'Absent (deduct)', render: (r) => r.absentDays ?? 0 },
            { key: 'holiday', label: 'Holiday', render: (r) => r.holidayDays ?? 0 },
            { key: 'weekend', label: 'Weekend', render: (r) => r.weekendDays ?? 0 },
            { key: 'reportAbsent', label: 'Report absent', render: (r) => r.reportAbsentDays ?? 0 },
            { key: 'late', label: 'Late', render: (r) => r.lateDays ?? 0 },
            { key: 'marked', label: 'Days marked', render: (r) => r.daysMarked },
            {
              key: 'approval',
              label: 'Approval',
              render: (r) => r.approvalStatus || 'pending',
            },
          ]}
          rows={monthlyRecords}
          emptyLabel="No monthly records yet. Save daily attendance to build your monthly summary."
        />
      </section>
    </div>
  );
};

export default TeacherMyAttendance;
