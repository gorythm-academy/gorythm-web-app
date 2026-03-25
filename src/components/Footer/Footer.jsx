// Footer Component – background image with dark overlay; scroll-triggered animation

import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FACEBOOK_URL } from '../../config/constants';
import footerBgImage from '../../assets/images/footer-bd-image.png';
import './Footer.scss';

const Footer = () => {
    const footerRef = useRef(null);
    const [isInView, setIsInView] = useState(false);

    useEffect(() => {
        const el = footerRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) setIsInView(true); },
            { threshold: 0.1, rootMargin: '0px 0px -20px 0px' }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <footer ref={footerRef} className={`site-footer${isInView ? ' footer-inview' : ''}`}>
            <div
                className="footer-bg"
                style={{ backgroundImage: `url(${footerBgImage})` }}
                aria-hidden="true"
            />
            <div className="footer-top footer-content">
                <div className="footer-container">
                    <div className="footer-grid">
                        {/* About Academy */}
                        <div className="footer-widget footer_anim footer-widget-1">
                            <h3 className="widget-title">About GORYTHM</h3>
                            <p className="widget-text">
                                GORYTHM is a premier online learning platform offering quality education 
                                from industry experts. We're committed to making education accessible to everyone.
                            </p>
                        </div>

                        {/* Quick Links */}
                        <div className="footer-widget footer_anim footer-widget-2">
                            <h3 className="widget-title">Quick Links</h3>
                            <ul className="footer-links">
                                <li><Link to="/courses">All Courses</Link></li>
                                <li><Link to="/instructors">Our Instructors</Link></li>
                                <li><Link to="/schedule">Class Schedule</Link></li>
                                <li><Link to="/about">About Us</Link></li>
                                <li><Link to="/contact">Contact</Link></li>
                            </ul>
                        </div>

                        {/* Contact Info */}
                        <div className="footer-widget footer_anim footer-widget-3">
                            <h3 className="widget-title">Contact Info</h3>
                            <ul className="contact-info">
                                <li className="contact-item">
                                    <i className="icon-location"></i>
                                    <span>123 Education Street, Learning City, LC 12345</span>
                                </li>
                               <li className="contact-item">
    <i className="fas fa-map-marker-alt"></i>
    <span>123 Education Street, Learning City, LC 12345</span>
</li>
<li className="contact-item">
    <i className="fas fa-phone"></i>
    <span>(123) 456-7890</span>
</li>
<li className="contact-item">
    <i className="fas fa-envelope"></i>
    <span>info@edumaster-academy.com</span>
</li>
<li className="contact-item">
    <i className="fas fa-clock"></i>
    <span>Support: 24/7 Available</span>
</li>
                            </ul>
                        </div>

                        {/* Newsletter */}
                        <div className="footer-widget footer_anim footer-widget-4">
                            <h3 className="widget-title">Stay Updated</h3>
                            <p className="widget-text">Subscribe to our newsletter for course updates and learning tips.</p>
                            <form className="newsletter-form">
                                <input 
                                    type="email" 
                                    placeholder="Your email address" 
                                    className="newsletter-input"
                                />
                                <button type="submit" className="newsletter-btn">
                                    Subscribe
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>

            <div className="footer-bottom footer-content">
                <div className="footer-container">
                    <div className="footer-bottom-content footer_anim footer-bottom-anim">
                        <div className="copyright">
                            © {new Date().getFullYear()} GORYTHM Online Academy. All rights reserved.
                        </div>
                        <div className="footer-social">
                            <a href={FACEBOOK_URL} className="social-link" aria-label="Facebook">
    <i className="fab fa-facebook-f"></i>
</a>
<a href="#" className="social-link" aria-label="Twitter">
    <i className="fab fa-twitter"></i>
</a>
<a href="https://www.instagram.com/al_farhan_academy_?utm_source=ig_web_button_share_sheet&amp;igsh=ZDNlZDc0MzIxNw==" className="social-link" aria-label="Instagram">
    <i className="fab fa-instagram"></i>
</a>
<a href="#" className="social-link" aria-label="LinkedIn">
    <i className="fab fa-linkedin-in"></i>
</a>
<a href="https://www.youtube.com/@alfarhanacademy" className="social-link" aria-label="YouTube">
    <i className="fab fa-youtube"></i>
</a>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;