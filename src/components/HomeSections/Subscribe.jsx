// Subscribe Section – one row: headline | email + privacy checkbox | Subscribe button (icon + text)
// Matches reference: big left text, center email + checkbox, right button with paper-plane in circle

import React, { useRef, useEffect, useState, useCallback } from 'react';
import './Subscribe.scss';
import { API_BASE_URL, SUBSCRIBE_PRIVACY_POLICY_BODY } from '../../config/constants';
import SiteValidationModal from '../SiteValidationModal/SiteValidationModal';

const EMAIL_MAX_LEN = 254;

const isValidSubscribeEmail = (value) => {
  const s = String(value).trim();
  if (!s || s.length > EMAIL_MAX_LEN) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
};

const collectSubscribeIssues = (email, agreePrivacy) => {
  const issues = [];
  if (!String(email ?? '').trim()) {
    issues.push('Please enter your email address.');
  } else if (!isValidSubscribeEmail(email)) {
    issues.push('Please enter a valid email address.');
  }
  if (!agreePrivacy) {
    issues.push('Please agree to the Privacy Policy to subscribe.');
  }
  return issues;
};

const SubscribeSection = () => {
  const sectionRef = useRef(null);
  const [isInView, setIsInView] = useState(false);
  const [email, setEmail] = useState('');
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [validationModal, setValidationModal] = useState({
    open: false,
    title: '',
    issues: [],
  });
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  const closeValidationModal = useCallback(() => {
    setValidationModal((prev) => ({ ...prev, open: false }));
  }, []);

  const closePrivacyModal = useCallback(() => {
    setPrivacyModalOpen(false);
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsInView(true);
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const issues = collectSubscribeIssues(email, agreePrivacy);
    if (issues.length > 0) {
      setValidationModal({
        open: true,
        title: 'Please check the following',
        issues,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/subscribers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          source: 'subscribe_section',
        }),
      });

      if (!response.ok) {
        let msg = 'Could not subscribe right now. Please try again.';
        try {
          const data = await response.json();
          if (data?.error) msg = data.error;
        } catch {
          /* ignore */
        }
        setValidationModal({
          open: true,
          title: 'Subscription could not be completed',
          issues: [msg],
        });
        return;
      }

      setIsSubmitted(true);
      setEmail('');
      setAgreePrivacy(false);
      setTimeout(() => setIsSubmitted(false), 5000);
    } catch (error) {
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
    <section ref={sectionRef} className={`subscribe-section scheme_dark${isInView ? ' subscribe-inview' : ''}`}>
      <div className="subscribe-section-inner">
        {isSubmitted ? (
          <div className="subscribe-success">
            <p>Thank you for subscribing.</p>
          </div>
        ) : (
          <form className="subscribe-row" onSubmit={handleSubmit} noValidate>
            <div className="subscribe-headline-wrap">
              <h2 className="subscribe-headline subscribe_anim">Stay updated with our latest courses.</h2>
            </div>

            <div className="subscribe-form-wrap subscribe_anim">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                className="subscribe-input"
                disabled={isSubmitting}
                autoComplete="email"
              />
              <label className="subscribe-privacy">
                <input
                  type="checkbox"
                  checked={agreePrivacy}
                  onChange={(e) => setAgreePrivacy(e.target.checked)}
                  className="subscribe-checkbox"
                  disabled={isSubmitting}
                />
                <span className="subscribe-checkbox-box" aria-hidden="true" />
                <span className="subscribe-privacy-text">
                  I agree to the{' '}
                  <button
                    type="button"
                    className="subscribe-privacy-link"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPrivacyModalOpen(true);
                    }}
                  >
                    Privacy Policy
                  </button>
                </span>
              </label>
            </div>

            <div className="subscribe-btn-wrap subscribe_anim">
              <button
                type="submit"
                className="subscribe-btn"
                disabled={isSubmitting}
                aria-label="Subscribe"
              >
                <span className="subscribe-btn-icon" aria-hidden="true">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </span>
                <span className="subscribe-btn-text">Subscribe</span>
              </button>
            </div>
          </form>
        )}
      </div>

      <SiteValidationModal
        open={validationModal.open}
        title={validationModal.title}
        issues={validationModal.issues}
        onClose={closeValidationModal}
      />
      <SiteValidationModal
        open={privacyModalOpen}
        title="Privacy Policy"
        issues={[SUBSCRIBE_PRIVACY_POLICY_BODY]}
        onClose={closePrivacyModal}
        showIcon={false}
      />
    </section>
  );
};

export default SubscribeSection;
