// Subscribe Section – one row: headline | email + privacy checkbox | Subscribe button (icon + text)
// Matches reference: big left text, center email + checkbox, right button with paper-plane in circle

import React, { useRef, useEffect, useState } from 'react';
import './Subscribe.scss';
import { API_BASE_URL } from '../../config/constants';

const SubscribeSection = () => {
  const sectionRef = useRef(null);
  const [isInView, setIsInView] = useState(false);
  const [email, setEmail] = useState('');
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsInView(true); },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (!agreePrivacy) {
      alert('Please agree to the Privacy Policy.');
      return;
    }
    setErrorMessage('');
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
        throw new Error('Subscription failed');
      }

      setIsSubmitting(false);
      setIsSubmitted(true);
      setEmail('');
      setAgreePrivacy(false);
      setTimeout(() => setIsSubmitted(false), 5000);
    } catch (error) {
      setIsSubmitting(false);
      setErrorMessage('Could not subscribe right now. Please try again.');
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
            {/* 1. Big headline – left */}
            <div className="subscribe-headline-wrap">
              <h2 className="subscribe-headline subscribe_anim">
                Stay updated with our latest courses.
              </h2>
            </div>

            {/* 2. Email + privacy – center */}
            <div className="subscribe-form-wrap subscribe_anim">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                className="subscribe-input"
                disabled={isSubmitting}
                required
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
                  <a href="/privacy" className="subscribe-privacy-link">Privacy Policy</a>
                </span>
              </label>
              {errorMessage ? (
                <p className="subscribe-error-message">{errorMessage}</p>
              ) : null}
            </div>

            {/* 3. Subscribe button – right (circle icon + text) */}
            <div className="subscribe-btn-wrap subscribe_anim">
              <button
                type="submit"
                className="subscribe-btn"
                disabled={isSubmitting}
                aria-label="Subscribe"
              >
                <span className="subscribe-btn-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    </section>
  );
};

export default SubscribeSection;
