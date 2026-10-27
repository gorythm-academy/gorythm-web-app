import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../../config/constants';
import SiteValidationModal from '../SiteValidationModal/SiteValidationModal';
import PhoneNumberField from '../shared/PhoneNumberField';
import { WHATSAPP_PHONE_MESSAGES } from '../../utils/phoneNumber';
import './ContactPage.scss';

const EMAIL_MAX_LEN = 254;
const NOT_SURE = 'Not sure yet';

const isValidEmail = (value) => {
  const s = String(value).trim();
  if (!s || s.length > EMAIL_MAX_LEN) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
};

const collectTrialValidationIssues = (form) => {
  const issues = [];
  if (!String(form.name ?? '').trim()) issues.push('Please enter your name.');
  const emailTrim = String(form.email ?? '').trim();
  if (!emailTrim) issues.push('Please enter your email address.');
  else if (!isValidEmail(form.email)) issues.push('Please enter a valid email address.');
  if (form.phoneStatus !== 'valid') {
    issues.push(
      form.phoneStatus === 'invalid'
        ? WHATSAPP_PHONE_MESSAGES.invalid
        : WHATSAPP_PHONE_MESSAGES.required
    );
  }
  if (!form.courseSlug) issues.push('Please choose a course, or “Not sure yet”.');
  if (String(form.preferredTime ?? '').trim().length > 200) {
    issues.push('Preferred time must be 200 characters or fewer.');
  }
  if (!form.consent) {
    issues.push('Please tick “I agree that my data is collected” to submit the form.');
  }
  return issues;
};

const TrialPage = () => {
  const preferredTimeRef = useRef(null);
  const [searchParams] = useSearchParams();
  const requestedCourse = searchParams.get('course') || '';
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    phoneStatus: 'empty',
    courseSlug: '',
    preferredTime: '',
    consent: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationModal, setValidationModal] = useState({
    open: false,
    title: '',
    issues: [],
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/courses/public`);
        const data = await res.json();
        if (cancelled || !res.ok || !data.success || !Array.isArray(data.courses)) return;
        setCourses(data.courses);
      } catch {
        /* The course list is optional; “Not sure yet” still works. */
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!requestedCourse || courses.length === 0) return;
    const match = courses.find(
      (course) => course.slug === requestedCourse || course.title === requestedCourse
    );
    if (!match?.slug) return;
    setForm((prev) => (prev.courseSlug ? prev : { ...prev, courseSlug: match.slug }));
  }, [courses, requestedCourse]);

  const closeValidationModal = useCallback(() => {
    setValidationModal((prev) => ({ ...prev, open: false }));
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handlePhoneChange = ({ e164, status }) => {
    setForm((prev) => ({ ...prev, phone: e164, phoneStatus: status }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    const issues = collectTrialValidationIssues(form);
    if (issues.length > 0) {
      setValidationModal({ open: true, title: 'Please check the following', issues });
      return;
    }

    const selected = courses.find((course) => course.slug === form.courseSlug);
    const courseTitle = form.courseSlug === 'not-sure' ? NOT_SURE : selected?.title || '';
    if (!courseTitle) {
      setValidationModal({
        open: true,
        title: 'Please check the following',
        issues: ['Please choose a course, or “Not sure yet”.'],
      });
      return;
    }

    setSubmitted(false);
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/trials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone,
          courseTitle,
          courseSlug: form.courseSlug === 'not-sure' ? 'not-sure' : form.courseSlug,
          preferredTime: form.preferredTime.trim(),
          consent: true,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        setValidationModal({
          open: true,
          title: 'Request could not be saved',
          issues: [data.error || 'Something went wrong. Please try again.'],
        });
        return;
      }
      setSubmitted(true);
      setForm({
        name: '',
        email: '',
        phone: '',
        phoneStatus: 'empty',
        courseSlug: '',
        preferredTime: '',
        consent: false,
      });
    } catch {
      setValidationModal({
        open: true,
        title: 'Connection problem',
        issues: ['Network error. Please check your connection and try again.'],
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="contact-page scheme_dark">
      <div className="contact-page__wrap">
        <header className="contact-page__hero">
          <h1 className="contact-page__title">Book a Free Trial</h1>
          <span className="contact-page__arrow" aria-hidden="true" />
        </header>

        <div className="contact-page__grid">
          <div className="contact-page__info">
            <p className="contact-page__kicker">Free trial class</p>
            <h2 className="contact-page__headline">Tell us how to reach you.</h2>
            <p className="contact-page__intro">
              This form only saves your details. It does not create an account or send a class link.
              Someone from the academy will contact you and share the link for your trial class.
            </p>
          </div>

          <div className="contact-page__form-wrap">
            <form className="contact-page__form" onSubmit={handleSubmit} noValidate>
              {submitted && (
                <p className="contact-page__success" role="status" aria-live="polite">
                  Thank you. Your trial request is saved. We will contact you with the class link.
                </p>
              )}
              <div className="contact-page__form-row">
                <label className="contact-page__field">
                  <span className="contact-page__field-icon" aria-hidden="true">
                    <i className="fa-solid fa-user" />
                  </span>
                  <span className="contact-page__required" aria-hidden="true">*</span>
                  <input
                    type="text"
                    name="name"
                    placeholder="Name"
                    aria-label="Name"
                    autoComplete="name"
                    value={form.name}
                    onChange={handleChange}
                    maxLength={120}
                    required
                  />
                </label>
                <label className="contact-page__field">
                  <span className="contact-page__field-icon" aria-hidden="true">
                    <i className="fa-solid fa-envelope" />
                  </span>
                  <span className="contact-page__required" aria-hidden="true">*</span>
                  <input
                    type="email"
                    name="email"
                    placeholder="Email Address"
                    aria-label="Email address"
                    value={form.email}
                    onChange={handleChange}
                    required
                    maxLength={EMAIL_MAX_LEN}
                    autoComplete="email"
                  />
                </label>
              </div>
              <div className="contact-page__form-row">
                <div className="contact-page__field">
                  <span className="contact-page__field-icon" aria-hidden="true">
                    <i className="fa-brands fa-whatsapp" />
                  </span>
                  <span className="contact-page__required" aria-hidden="true">*</span>
                  <PhoneNumberField
                    appearance="bare"
                    value={form.phone}
                    onChange={handlePhoneChange}
                    ariaLabel="WhatsApp number"
                    required
                  />
                </div>
              </div>
              <div className="contact-page__form-row">
                <label className="contact-page__field">
                  <span className="contact-page__field-icon" aria-hidden="true">
                    <i className="fa-solid fa-book" />
                  </span>
                  <span className="contact-page__required" aria-hidden="true">*</span>
                  <select
                    name="courseSlug"
                    aria-label="Course"
                    value={form.courseSlug}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Choose a course</option>
                    <option value="not-sure">{NOT_SURE}</option>
                    {courses.filter((course) => course.slug).map((course) => (
                      <option key={course._id || course.slug} value={course.slug || course.title}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="contact-page__form-row">
                <label className="contact-page__field">
                  <button
                    type="button"
                    className="contact-page__field-icon"
                    aria-label="Choose a day and time"
                    onClick={() => {
                      const input = preferredTimeRef.current;
                      if (!input) return;
                      input.focus();
                      if (typeof input.showPicker === 'function') {
                        try {
                          input.showPicker();
                        } catch {
                          /* The browser keeps the field focused so the picker can still open. */
                        }
                      }
                    }}
                  >
                    <i className="fa-solid fa-clock" aria-hidden="true" />
                  </button>
                  <input
                    ref={preferredTimeRef}
                    type="datetime-local"
                    name="preferredTime"
                    aria-label="Preferred day and time, optional"
                    value={form.preferredTime}
                    onChange={handleChange}
                  />
                </label>
              </div>
              <div className="contact-page__form-actions">
                <button type="submit" className="contact-page__submit" disabled={isSubmitting}>
                  <i className="fa-solid fa-paper-plane contact-page__submit-icon" aria-hidden="true" />
                  {isSubmitting ? 'Sending…' : 'Request a trial'}
                </button>
                <label className="contact-page__consent">
                  <input
                    type="checkbox"
                    name="consent"
                    checked={form.consent}
                    onChange={handleChange}
                    required
                  />
                  <span>
                    I agree that my data is collected as described in the{' '}
                    <Link to="/privacy" target="_blank" rel="noopener noreferrer">
                      Privacy Policy
                    </Link>
                    <span className="contact-page__required" aria-hidden="true">*</span>
                    .
                  </span>
                </label>
              </div>
            </form>
          </div>
        </div>
      </div>

      <SiteValidationModal
        open={validationModal.open}
        title={validationModal.title}
        issues={validationModal.issues}
        onClose={closeValidationModal}
      />
    </section>
  );
};

export default TrialPage;
