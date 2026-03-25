import React from 'react';
import { NavLink } from 'react-router-dom';
import { FACEBOOK_URL, YOUTUBE_URL } from '../../config/constants';
import footerBgImage from '../../assets/images/footer-bd-image.png';
import './FooterSimple.scss';

const FooterSimple = () => {
  return (
    <footer className="footer-milky">
      <div
        className="footer-milky-bg"
        style={{ backgroundImage: `url(${footerBgImage})` }}
        aria-hidden="true"
      />

      <div className="footer-milky-inner">
        <div className="footer-milky-top">
          <div className="footer-milky-copy">
            <h2 className="footer-milky-title">Your journey starts here!</h2>
            <p className="footer-milky-subtitle">Let&apos;s talk!</p>

            <nav className="footer-milky-nav" aria-label="Footer navigation">
              <NavLink to="/" end>
                Home
              </NavLink>
              <NavLink to="/courses">All Courses</NavLink>
              <NavLink to="/about">About Us</NavLink>
              <NavLink to="/blog">Blog</NavLink>
              <NavLink to="/contact">Contact Us</NavLink>
            </nav>
          </div>

          <div className="footer-milky-social" aria-label="Social links">
            <a
              href={FACEBOOK_URL}
              className="footer-milky-social-link"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
            >
              <i className="fab fa-facebook-f" />
            </a>
            <a
              href={YOUTUBE_URL}
              className="footer-milky-social-link"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="YouTube"
            >
              <i className="fab fa-youtube" />
            </a>
            <a
              href="https://www.instagram.com/al_farhan_academy_?utm_source=ig_web_button_share_sheet&amp;igsh=ZDNlZDc0MzIxNw=="
              className="footer-milky-social-link"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
            >
              <i className="fab fa-instagram" />
            </a>
          </div>
        </div>

        <div className="footer-milky-bottom">
          <div className="footer-milky-copyright">
            Gorythm © 2026. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
};

export default FooterSimple;
