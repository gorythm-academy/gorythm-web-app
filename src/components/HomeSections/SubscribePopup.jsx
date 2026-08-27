import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './SubscribePopup.scss';
import popupVisual from '../../assets/images/home/subscribe.png';
import { API_BASE_URL, SUBSCRIBE_PRIVACY_POLICY_BODY } from '../../config/constants';
import { resolveMediaUrl } from '../../utils/resolveMediaUrl';
import SiteValidationModal from '../SiteValidationModal/SiteValidationModal';

const STORAGE_KEY = 'gorythm_subscribe_popup_seen_v1';
const EMAIL_MAX_LEN = 254;

const DEFAULT_POPUP = {
  enabled: false,
  delaySeconds: 10,
  headline: 'Stay updated with our latest courses.',
  buttonText: 'Subscribe',
  imagePath: '',
};

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

const SubscribePopup = () => {
  const [popupConfig, setPopupConfig] = useState(DEFAULT_POPUP);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [agreePrivacy, setAgreePrivacy] = useState(false);
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
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/site/subscribe-popup`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.success && data.popup) {
          setPopupConfig({ ...DEFAULT_POPUP, ...data.popup });
        }
      })
      .catch(() => {
        /* keep defaults */
      })
      .finally(() => {
        if (!cancelled) setConfigLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!configLoaded || !popupConfig.enabled) return undefined;
    if (typeof window === 'undefined') return undefined;
    if (window.sessionStorage.getItem(STORAGE_KEY) === '1') return undefined;

    const delayMs = Math.max(0, Number(popupConfig.delaySeconds) || 0) * 1000;
    const showPopup = () => {
      window.sessionStorage.setItem(STORAGE_KEY, '1');
      setIsVisible(true);
    };

    const timerId = window.setTimeout(showPopup, delayMs);
    return () => window.clearTimeout(timerId);
  }, [configLoaded, popupConfig.enabled, popupConfig.delaySeconds]);

  const closePopup = () => {
    setIsVisible(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const issues = collectSubscribeIssues(email, agreePrivacy);
    if (issues.length > 0) {
      setValidationModal({
        open: true,
        title: 'Please check the following',
        issues,
      });
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/subscribers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          source: 'subscribe_popup',
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
      window.setTimeout(() => {
        setIsVisible(false);
      }, 1200);
    } catch (error) {
      setValidationModal({
        open: true,
        title: 'Connection problem',
        issues: ['Network error. Please check your connection and try again.'],
      });
    }
  };

  if (!configLoaded || !popupConfig.enabled) return null;

  const popupImageSrc = popupConfig.imagePath
    ? resolveMediaUrl(popupConfig.imagePath)
    : popupVisual;

  const popupMarkup = (
    <div className="subscribe-popup-overlay" role="dialog" aria-modal="true" aria-label="Subscribe popup">
      <div className="subscribe-popup-card">
        <div className="subscribe-popup-visual" aria-hidden="true">
          <img src={popupImageSrc} alt="Newsletter subscription" className="subscribe-popup-visual-img" draggable={false} />
        </div>

        <div className="subscribe-popup-content">
          <button
            type="button"
            className="subscribe-popup-close"
            onClick={closePopup}
            aria-label="Close subscribe popup"
          >
            ×
          </button>

          {isSubmitted ? (
            <div className="subscribe-popup-success">
              <h3>Thank you for subscribing.</h3>
            </div>
          ) : (
            <form className="subscribe-popup-form" onSubmit={handleSubmit} noValidate>
              <h2>{popupConfig.headline}</h2>

              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email address"
                autoComplete="email"
                className="subscribe-popup-input"
              />

              <label className="subscribe-popup-privacy">
                <input
                  type="checkbox"
                  checked={agreePrivacy}
                  onChange={(event) => setAgreePrivacy(event.target.checked)}
                />
                <span>
                  I agree to the{' '}
                  <button
                    type="button"
                    className="subscribe-popup-privacy-link"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPrivacyModalOpen(true);
                    }}
                  >
                    Privacy Policy
                  </button>
                  .
                </span>
              </label>

              <button type="submit" className="subscribe-popup-submit">
                {popupConfig.buttonText}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );

  if (!isVisible || typeof document === 'undefined') return null;

  return (
    <>
      {createPortal(popupMarkup, document.body)}
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
    </>
  );
};

export default SubscribePopup;
