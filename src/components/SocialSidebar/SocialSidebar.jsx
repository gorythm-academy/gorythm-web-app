import React from 'react';
import { FACEBOOK_URL } from '../../config/constants';
import './SocialSidebar.scss';

const SocialSidebar = ({ isOpen, onClose }) => {
  const socialLinks = [
    { icon: 'fab fa-facebook-f', label: 'Facebook', url: FACEBOOK_URL },
    { icon: 'fab fa-instagram', label: 'Instagram', url: '#' },
    { icon: 'fab fa-youtube', label: 'YouTube', url: '#' },
  ];

  return (
    <>
      <div className={`social-sidebar-panel ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h3>Connect With Us</h3>
          <button
            className="close-sidebar"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            &times;
          </button>
        </div>

        <div className="sidebar-content-wrapper">
          {/* VERTICAL CENTERED ICONS WITH LABELS */}
          <div className="social-icons-vertical-center">
            {socialLinks.map((social, index) => (
              <a
                key={index}
                href={social.url}
                className="social-icon-item"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={social.label}
              >
                <div className="icon-container">
                  <i className={social.icon}></i>
                </div>
                <span className="social-label">{social.label}</span>
              </a>
            ))}
          </div>

          {/* CONTACT INFO AT BOTTOM */}
          <div className="sidebar-contact-info">
            <div className="contact-item">
              <i className="fas fa-phone-alt contact-icon"></i>
              <div className="contact-details">
                <span className="contact-label">Call Us</span>
                <a href="tel:+18408412569" className="contact-value">+1 840 841 25 69</a>
              </div>
            </div>
            <div className="contact-item">
              <i className="fas fa-envelope contact-icon"></i>
              <div className="contact-details">
                <span className="contact-label">Email Us</span>
                <a href="mailto:info@swal.com" className="contact-value">info@swal.com</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={onClose}
          aria-label="Close sidebar"
        />
      )}
    </>
  );
};

export default SocialSidebar;