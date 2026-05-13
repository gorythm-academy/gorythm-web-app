import React, { useState, useCallback } from 'react';
import { FiMapPin, FiMail, FiUser, FiEdit3, FiSend } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';
import { API_BASE_URL, INFO_EMAIL, WHATSAPP_URL, CONTACT_PHONE, CONTACT_ADDRESS } from '../../config/constants';
import { navigateToMailto } from '../../utils/mailto';
import SiteValidationModal from '../SiteValidationModal/SiteValidationModal';
import './ContactPage.scss';

/** WhatsApp / E.164-style: digits only, 7–15 when provided (optional field). */
const PHONE_DIGITS_MIN = 7;
const PHONE_DIGITS_MAX = 15;

const normalizePhoneDigits = (raw) =>
  String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, PHONE_DIGITS_MAX);

const isPhoneValidOrEmpty = (digits) =>
  !digits || (digits.length >= PHONE_DIGITS_MIN && digits.length <= PHONE_DIGITS_MAX);

const EMAIL_MAX_LEN = 254;
/** Practical format check (aligned with backend). */
const isValidEmail = (value) => {
  const s = String(value).trim();
  if (!s || s.length > EMAIL_MAX_LEN) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
};

/** All client-side checks so the user sees every problem in one popup. */
const collectContactValidationIssues = (form) => {
  const issues = [];
  if (!String(form.name ?? '').trim()) {
    issues.push('Please enter your name.');
  }
  const emailTrim = String(form.email ?? '').trim();
  if (!emailTrim) {
    issues.push('Please enter your email address.');
  } else if (!isValidEmail(form.email)) {
    issues.push('Please enter a valid email address.');
  }
  if (!String(form.message ?? '').trim()) {
    issues.push('Please enter a message so we know how to help.');
  }
  if (!isPhoneValidOrEmpty(form.phone)) {
    issues.push(
      `WhatsApp number must be ${PHONE_DIGITS_MIN}–${PHONE_DIGITS_MAX} digits (country code, numbers only), or leave the field empty.`
    );
  }
  if (!form.consent) {
    issues.push('Please tick “I agree that my data is collected” to submit the form.');
  }
  return issues;
};

const contactInfo = {
  address: CONTACT_ADDRESS,
  phone: CONTACT_PHONE,
  email: INFO_EMAIL,
};

const ContactPage = () => {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    message: '',
    consent: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [validationModal, setValidationModal] = useState({
    open: false,
    title: '',
    issues: [],
  });

  const closeValidationModal = useCallback(() => {
    setValidationModal((prev) => ({ ...prev, open: false }));
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handlePhoneChange = (e) => {
    const digits = normalizePhoneDigits(e.target.value);
    setForm((prev) => ({ ...prev, phone: digits }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const issues = collectContactValidationIssues(form);
    if (issues.length > 0) {
      setValidationModal({
        open: true,
        title: 'Please check the following',
        issues,
      });
      return;
    }

    setSubmitted(false);

    try {
      const response = await fetch(`${API_BASE_URL}/api/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...form,
          email: form.email.trim().toLowerCase(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error('Contact form API error', { status: response.status, data });
        setValidationModal({
          open: true,
          title: 'Message could not be sent',
          issues: [data.error || 'Something went wrong while sending your message. Please try again.'],
        });
        return;
      }

      setSubmitted(true);
      // Optional: clear form after successful submit
      setForm({
        name: '',
        email: '',
        phone: '',
        message: '',
        consent: false,
      });
    } catch (error) {
      console.error('Contact form submission error', error);
      setValidationModal({
        open: true,
        title: 'Connection problem',
        issues: ['Network error. Please check your connection and try again.'],
      });
    }
  };

  return (
    <section className="contact-page scheme_dark">
      <div className="contact-page__wrap">
        <header className="contact-page__hero">
          <h1 className="contact-page__title">Contact Us</h1>
          <span className="contact-page__arrow" aria-hidden="true" />
        </header>

        <div className="contact-page__grid">
          <div className="contact-page__info">
            <p className="contact-page__kicker">Contact us</p>
            <h2 className="contact-page__headline">Have questions? Get in touch!</h2>
            <p className="contact-page__intro">
             
              Reach out for course guidance, enrollment questions, or general support. We’ll help you
              take the next step in your Islamic education journey.
            </p>
            <ul className="contact-page__details">
              <li>
                <span className="contact-page__icon-wrap" aria-hidden="true">
                  <FiMapPin className="contact-page__icon" />
                </span>
                <span>{contactInfo.address}</span>
              </li>
              <li>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`WhatsApp ${contactInfo.phone}`}
                >
                  <span className="contact-page__icon-wrap" aria-hidden="true">
                    <FaWhatsapp className="contact-page__icon" />
                  </span>
                  <span>{contactInfo.phone}</span>
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${contactInfo.email}`}
                  aria-label={`Send email to ${contactInfo.email}`}
                  onClick={(e) => navigateToMailto(contactInfo.email, e)}
                >
                  <span className="contact-page__icon-wrap" aria-hidden="true">
                    <FiMail className="contact-page__icon" />
                  </span>
                  <span>{contactInfo.email}</span>
                </a>
              </li>
            </ul>
          </div>

          <div className="contact-page__form-wrap">
            <form className="contact-page__form" onSubmit={handleSubmit} noValidate>
              {submitted && (
                <p className="contact-page__success" role="status" aria-live="polite">
                  Thank you. Your message has been sent. We’ll get back to you soon.
                </p>
              )}
              <div className="contact-page__form-row">
                <label className="contact-page__field">
                  <span className="contact-page__field-icon" aria-hidden="true"><FiUser /></span>
                  <input
                    type="text"
                    name="name"
                    placeholder="Name"
                    value={form.name}
                    onChange={handleChange}
                    required
                  />
                </label>
                <label className="contact-page__field">
                  <span className="contact-page__field-icon" aria-hidden="true"><FiMail /></span>
                  <input
                    type="email"
                    name="email"
                    placeholder="Email Address"
                    value={form.email}
                    onChange={handleChange}
                    required
                    maxLength={EMAIL_MAX_LEN}
                    autoComplete="email"
                  />
                </label>
              </div>
              <div className="contact-page__form-row">
                <label className="contact-page__field">
                  <span className="contact-page__field-icon" aria-hidden="true"><FaWhatsapp /></span>
                  <input
                    type="tel"
                    name="phone"
                    placeholder="WhatsApp number (digits only, with country code)"
                    value={form.phone}
                    onChange={handlePhoneChange}
                    autoComplete="tel"
                    inputMode="numeric"
                  />
                </label>
              </div>
              <label className="contact-page__field contact-page__field--full">
                <span className="contact-page__field-icon" aria-hidden="true"><FiEdit3 /></span>
                <textarea
                  name="message"
                  placeholder="How can we help you? Feel free to get in touch!"
                  value={form.message}
                  onChange={handleChange}
                  rows={4}
                  required
                />
              </label>
              <div className="contact-page__form-actions">
                <button type="submit" className="contact-page__submit">
                  <FiSend className="contact-page__submit-icon" aria-hidden="true" />
                  Get in Touch
                </button>
                <label className="contact-page__consent">
                  <input
                    type="checkbox"
                    name="consent"
                    checked={form.consent}
                    onChange={handleChange}
                    required
                  />
                  <span>I agree that my data is collected.</span>
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

export default ContactPage;
