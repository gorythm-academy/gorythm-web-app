import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './NewsletterIdlePopup.scss';
import popupVisual from '../../assets/images/hero-bg-revert.jpg';

const STORAGE_KEY = 'gorythm_newsletter_popup_seen_v1';
const POPUP_DELAY_MS = 10000;

const NewsletterIdlePopup = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (window.localStorage.getItem(STORAGE_KEY) === '1') return undefined;

    const showPopup = () => {
      window.localStorage.setItem(STORAGE_KEY, '1');
      setIsVisible(true);
    };

    const timerId = window.setTimeout(showPopup, POPUP_DELAY_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, []);

  const closePopup = () => {
    setIsVisible(false);
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!email.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    if (!agreePrivacy) {
      setErrorMessage('Please agree to the Privacy Policy.');
      return;
    }

    setErrorMessage('');
    setIsSubmitted(true);

    window.setTimeout(() => {
      setIsVisible(false);
    }, 1200);
  };

  if (!isVisible) return null;

  const popupMarkup = (
    <div className="newsletter-idle-popup-overlay" role="dialog" aria-modal="true" aria-label="Newsletter subscription popup">
      <div className="newsletter-idle-popup-card">
        <div
          className="newsletter-idle-popup-visual"
          style={{ backgroundImage: `url(${popupVisual})` }}
          aria-hidden="true"
        />

        <div className="newsletter-idle-popup-content">
          <button
            type="button"
            className="newsletter-idle-popup-close"
            onClick={closePopup}
            aria-label="Close newsletter popup"
          >
            ×
          </button>

          {isSubmitted ? (
            <div className="newsletter-idle-popup-success">
              <h3>Thank you for subscribing.</h3>
            </div>
          ) : (
            <form className="newsletter-idle-popup-form" onSubmit={handleSubmit} noValidate>
              <h2>Stay updated with our latest courses.</h2>

              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email address"
                autoComplete="email"
                className="newsletter-idle-popup-input"
              />

              <label className="newsletter-idle-popup-privacy">
                <input
                  type="checkbox"
                  checked={agreePrivacy}
                  onChange={(event) => setAgreePrivacy(event.target.checked)}
                />
                <span>I agree to the <a href="/privacy">Privacy Policy</a>.</span>
              </label>

              {errorMessage ? (
                <p className="newsletter-idle-popup-error">{errorMessage}</p>
              ) : null}

              <button type="submit" className="newsletter-idle-popup-submit">
                Subscribe
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(popupMarkup, document.body);
};

export default NewsletterIdlePopup;
