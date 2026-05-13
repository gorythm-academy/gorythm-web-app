import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';
import './Header.scss';
import headerLogo from '../../assets/images/home/logo.png';
import {
  INFO_EMAIL,
  CONTACT_PHONE,
  FACEBOOK_URL,
  getWhatsAppDirectUrl,
  onWhatsAppAnchorClick,
  INSTAGRAM_URL,
  YOUTUBE_URL,
  TIKTOK_URL,
} from '../../config/constants';
import { navigateToMailto } from '../../utils/mailto';

/** Viewports using compact nav (hamburger / tablet layout). */
const MOBILE_TABLET_MAX_WIDTH = 1279;

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);              // 9-dot grid sidebar
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);  // mobile overlay
  const [isMobileMenuClosing, setIsMobileMenuClosing] = useState(false);
  const [isMobileMenuActive, setIsMobileMenuActive] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [activeDropdown, setActiveDropdown] = useState(null);       // for mobile dropdowns
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= MOBILE_TABLET_MAX_WIDTH
  );
  const [isPortrait, setIsPortrait] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(orientation: portrait)').matches
  );

  const dropdownTimeout = useRef(null);
  const closeMenuTimeout = useRef(null);
  const headerRef = useRef(null);
  const mobileMenuRef = useRef(null);
  const gridPanelRef = useRef(null);
  const lastScrollYRef = useRef(0);
  const scrollRafRef = useRef(0);
  const showCooldownRef = useRef(false);   // blocks hide for a short window after show
  const showCooldownTimerRef = useRef(0);
  /** Hysteresis for frosted header: avoids flicker/jump at a single pixel line */
  const scrolledLatchRef = useRef(false);

  const menuItems = [
    { id: 1, title: 'Home', path: '/', hasDropdown: false },
    { id: 2, title: 'All Courses', path: '/courses', hasDropdown: false },
    { id: 3, title: 'About Us', path: '/about', hasDropdown: false },
    { id: 4, title: 'Blog', path: '/blog', hasDropdown: false },
    { id: 5, title: 'Contact Us', path: '/contact', hasDropdown: false },
  ];

  const socialLinks = [
    { id: 1, iconClass: 'fab fa-facebook-f', label: 'Facebook', url: FACEBOOK_URL },
    { id: 2, iconClass: 'fab fa-instagram', label: 'Instagram', url: INSTAGRAM_URL },
    { id: 3, iconClass: 'fab fa-youtube', label: 'YouTube', url: YOUTUBE_URL },
    { id: 4, iconClass: 'fab fa-tiktok', label: 'TikTok', url: TIKTOK_URL },
  ];

  const renderSocialGlyph = (link) => <i className={link.iconClass} />;

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= MOBILE_TABLET_MAX_WIDTH;
      setIsMobile(mobile);
      if (!mobile && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
      if (dropdownTimeout.current) clearTimeout(dropdownTimeout.current);
    };
  }, [isMobileMenuOpen]);

  // Detect orientation: portrait = simple layout, landscape = two columns
  useEffect(() => {
    const mql = window.matchMedia('(orientation: portrait)');
    const handleChange = () => {
      const portrait = mql.matches;
      setIsPortrait(portrait);
      // 9-dot sidebar is landscape-only; close it immediately on portrait rotate.
      if (portrait) setIsMenuOpen(false);
    };
    handleChange();
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  // Scroll effects — all viewports:
  // - scrolled: frosted bar via hysteresis (on/off thresholds)
  // - headerVisible: hide on scroll-down, show on scroll-up; always visible near top
  //   Uses a 300ms cooldown after showing so residual scroll events can't re-hide immediately.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const TOP_REVEAL_Y = 20;
    const SCROLLED_ON_PX = 80;
    const SCROLLED_OFF_PX = 28;
    const DELTA_THRESHOLD = 10;   // larger = less sensitive to micro-noise
    const SHOW_COOLDOWN_MS = 300; // after showing, ignore hide signals for this long

    const syncStickyStateFromViewport = () => {
      const y0 = window.scrollY || 0;
      lastScrollYRef.current = y0;
      scrolledLatchRef.current = y0 > SCROLLED_ON_PX;
      setScrolled(scrolledLatchRef.current);
      if (y0 <= TOP_REVEAL_Y) setHeaderVisible(true);
    };

    syncStickyStateFromViewport();

    const onScroll = () => {
      if (scrollRafRef.current) return;
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = 0;

        const currentY = window.scrollY || 0;
        const lastY = lastScrollYRef.current;
        const delta = currentY - lastY;

        // Update frosted background latch
        let nextScrolled = scrolledLatchRef.current;
        if (!nextScrolled && currentY > SCROLLED_ON_PX) nextScrolled = true;
        else if (nextScrolled && currentY < SCROLLED_OFF_PX) nextScrolled = false;
        if (nextScrolled !== scrolledLatchRef.current) {
          scrolledLatchRef.current = nextScrolled;
          setScrolled(nextScrolled);
        }

        if (!isMobileMenuOpen) {
          if (currentY <= TOP_REVEAL_Y) {
            if (showCooldownTimerRef.current) clearTimeout(showCooldownTimerRef.current);
            showCooldownRef.current = false;
            setHeaderVisible(true);
          } else if (Math.abs(delta) >= DELTA_THRESHOLD) {
            if (delta < 0) {
              setHeaderVisible(true);
              if (showCooldownTimerRef.current) clearTimeout(showCooldownTimerRef.current);
              showCooldownRef.current = true;
              showCooldownTimerRef.current = setTimeout(() => {
                showCooldownRef.current = false;
              }, SHOW_COOLDOWN_MS);
            } else if (!showCooldownRef.current) {
              setHeaderVisible(false);
            }
          }
        }

        lastScrollYRef.current = currentY;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (scrollRafRef.current) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = 0;
      }
      if (showCooldownTimerRef.current) {
        clearTimeout(showCooldownTimerRef.current);
      }
    };
  }, [isMobileMenuOpen, isMobile]);

  // Click outside to close mobile menu; prevent page scroll when menu open (wheel)
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target) && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };

    const handleWheel = (event) => {
      if (!isMobileMenuOpen || !mobileMenuRef.current) return;
      if (!mobileMenuRef.current.contains(event.target)) {
        event.preventDefault();
      }
    };

    const handleTouchMove = (event) => {
      if (!isMobileMenuOpen || !mobileMenuRef.current) return;
      if (!mobileMenuRef.current.contains(event.target)) {
        event.preventDefault();
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('wheel', handleWheel, { passive: false });
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('wheel', handleWheel);
      document.removeEventListener('touchmove', handleTouchMove);
    };
  }, [isMobileMenuOpen]);

  // Click outside / Escape to close grid sidebar
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        gridPanelRef.current &&
        !gridPanelRef.current.contains(event.target) &&
        !event.target.closest('.menu-grid-trigger') &&
        isMenuOpen
      ) {
        setIsMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape' && isMenuOpen) setIsMenuOpen(false);
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMenuOpen]);


  // Lock page scroll only for the hamburger mobile menu.
  // 9-dot sidebar keeps background page scroll enabled by request.
  useEffect(() => {
    document.documentElement.classList.toggle('no-page-scroll', isMobileMenuOpen);
    document.body.classList.toggle('no-page-scroll', isMobileMenuOpen);
    return () => {
      document.documentElement.classList.remove('no-page-scroll');
      document.body.classList.remove('no-page-scroll');
    };
  }, [isMobileMenuOpen]);

  // Desktop dropdown hover handlers
  const handleDropdownEnter = (menuId) => {
    if (!isMobile) {
      if (dropdownTimeout.current) clearTimeout(dropdownTimeout.current);
      setActiveDropdown(menuId);
    }
  };

  const handleDropdownLeave = () => {
    if (!isMobile) {
      dropdownTimeout.current = setTimeout(() => setActiveDropdown(null), 300);
    }
  };

  // Mobile dropdown toggle
  const toggleMobileDropdown = (menuId) => {
    if (isMobile) {
      setActiveDropdown(prev => (prev === menuId ? null : menuId));
    }
  };

  const openMobileMenu = () => {
    setIsMobileMenuOpen(true);
    setIsMobileMenuClosing(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsMobileMenuActive(true));
    });
  };

  const closeMobileMenu = () => {
    setIsMobileMenuActive(false);
    setIsMobileMenuClosing(true);
    if (closeMenuTimeout.current) clearTimeout(closeMenuTimeout.current);
    // Match overlay close animation duration (1s in Header.scss .mobile-menu-overlay.closing)
    closeMenuTimeout.current = setTimeout(() => {
      setIsMobileMenuOpen(false);
      setIsMobileMenuClosing(false);
      setActiveDropdown(null);
    }, 1000);
  };

  const toggleGridSidebar = () => setIsMenuOpen(prev => !prev);

  return (
    <>
      {/* Main header – always in DOM; hidden via CSS when mobile menu is open */}
      <header
        className={`header ${scrolled ? 'scrolled' : ''}${!headerVisible ? ' header--hidden' : ''}${isMobileMenuOpen ? ' header--mobile-menu-open' : ''}`}
        ref={headerRef}
        aria-hidden={isMobileMenuOpen}
      >
          <div className="header-container header-container--fullwidth">
            <div className="header-inner">
              {/* Logo */}
              <div className="header-logo">
                <Link to="/" className="logo-link" onClick={closeMobileMenu}>
                  <div className="logo-text">
                    <img className="logo-image" src={headerLogo} alt="GoRythm" />
                  </div>

                </Link>
              </div>

              <div className="header-right-group">
                {/* Desktop navigation */}
                <nav className="header-nav desktop-nav">
                  <ul className="nav-menu">
                    {menuItems.map(item => (
                      <li
                        key={item.id}
                        className={`nav-item ${item.hasDropdown ? 'has-dropdown' : ''} ${activeDropdown === item.id ? 'dropdown-open' : ''}`}
                        onMouseEnter={() => handleDropdownEnter(item.id)}
                        onMouseLeave={handleDropdownLeave}
                      >
                        <NavLink
                          to={item.path}
                          end={item.path === '/'}
                          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                        >
                          {item.title}
                          {item.hasDropdown && (
                            <span className="dropdown-arrow">
                              <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                                <path d="M1 1.5L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                          )}
                        </NavLink>

                        {/* Desktop dropdown (always rendered but hidden via CSS) */}
                        {item.hasDropdown && !isMobile && (
                          <div className="dropdown-menu">
                            <div className="dropdown-content">
                              {item.dropdownItems.map((dropdownItem, idx) => (
                                <Link key={idx} to={dropdownItem.path} className="dropdown-item" onClick={() => setActiveDropdown(null)}>
                                  {dropdownItem.title}
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                    <li className="nav-item nav-item--login">
                      <NavLink to="/login" className="nav-link nav-link--login">
                        Login
                      </NavLink>
                    </li>
                  </ul>
                </nav>

                {/* Header actions: WhatsApp, cart, grid, hamburger */}
                <div className="header-actions">
                  <a
                    href={getWhatsAppDirectUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onWhatsAppAnchorClick}
                    className="header-whatsapp header-whatsapp--header"
                    aria-label="Chat on WhatsApp"
                  >
                    <i className="fab fa-whatsapp" />
                  </a>
                  {/* Cart icon – always visible on mobile/tablet/desktop
                  <button className="cart-trigger" aria-label="Cart">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 6h15l-1.5 8h-12L6 6zm0 0L4.5 3H2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <circle cx="9" cy="20" r="2" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="18" cy="20" r="2" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </button>
                  */}

                  {/* Hamburger – shown on mobile/tablet via CSS */}
                  <button
                    className="mobile-menu-toggle"
                    onClick={openMobileMenu}
                    aria-label="Open navigation menu"
                  >
                    <span className="toggle-line line-1"></span>
                    <span className="toggle-line line-2"></span>
                    <span className="toggle-line line-3"></span>
                  </button>

                  {/* 9-dot grid trigger – shown only on desktop and landscape tablet/mobile via CSS */}
                  <button
                    className={`menu-grid-trigger ${isMenuOpen ? 'active' : ''}`}
                    onClick={toggleGridSidebar}
                    aria-label={isMenuOpen ? 'Close menu grid' : 'Open menu grid'}
                  >
                    <span className="menu-grid-icon">
                      {[...Array(9)].map((_, i) => <span key={i} className="menu-grid-dot"></span>)}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

      {/* Mobile menu overlay */}
      {isMobileMenuOpen && (
        <div
          className={`mobile-menu-overlay${isMobileMenuActive && !isMobileMenuClosing ? ' active' : ''}${isMobileMenuClosing ? ' closing' : ''}`}
          ref={mobileMenuRef}
        >
          <div className="mobile-menu-container">
            {/* Header row */}
            <div className="mobile-menu-header mobile-header-anim">
              <div className="mobile-logo">
                <Link to="/" onClick={closeMobileMenu}>
                  <div className="logo-text">
                    <img className="logo-image" src={headerLogo} alt="GoRythm" />
                  </div>
                </Link>
              </div>
              <button
                className={`mobile-menu-close${isMobileMenuActive && !isMobileMenuClosing ? ' rotate-open' : ''}${isMobileMenuClosing ? ' rotate-close' : ''}`}
                onClick={closeMobileMenu}
                aria-label="Close menu"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* Portrait: single content block. Landscape: two columns (left = nav/auth/social, right = contact/enroll) */}
            {isPortrait ? (
              <div className="mobile-menu-portrait">
                <nav className="mobile-nav">
                  <ul className="mobile-nav-menu">
                    {menuItems.map((item, index) => (
                      <li
                        key={item.id}
                        className={`mobile-nav-item mobile-nav-item-anim${item.hasDropdown ? ' has-dropdown' : ''}${activeDropdown === item.id ? ' dropdown-open' : ''}`}
                        style={{ '--item-index': index }}
                      >
                        <div className="mobile-nav-item-inner">
                          <NavLink
                            to={item.hasDropdown ? '#' : item.path}
                            end={item.path === '/'}
                            className={({ isActive }) => `mobile-nav-link${isActive ? ' active' : ''}`}
                            onClick={(e) => {
                              if (item.hasDropdown) {
                                e.preventDefault();
                                toggleMobileDropdown(item.id);
                              } else {
                                closeMobileMenu();
                              }
                            }}
                          >
                            {item.title}
                          </NavLink>
                          {item.hasDropdown ? (
                            <button
                              className={`mobile-arrow-toggle${activeDropdown === item.id ? ' open' : ''}`}
                              onClick={() => toggleMobileDropdown(item.id)}
                              aria-label={`Toggle ${item.title} submenu`}
                            >
                              →
                            </button>
                          ) : (
                            <Link
                              to={item.path}
                              className="mobile-nav-arrow mobile-nav-arrow-link"
                              onClick={closeMobileMenu}
                              aria-label={`Go to ${item.title}`}
                            >
                              →
                            </Link>
                          )}
                        </div>
                        {item.hasDropdown && (
                          <div className="mobile-nav-dropdown">
                            {item.dropdownItems.map((dropdownItem, idx) => (
                              <Link
                                key={idx}
                                to={dropdownItem.path}
                                className="mobile-nav-dropdown-item"
                                onClick={closeMobileMenu}
                              >
                                {dropdownItem.title}
                              </Link>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </nav>
                <div className="mobile-menu-left-divider" aria-hidden="true" />
                <div className="mobile-auth-buttons mobile-auth-anim">
                  <Link to="/login" className="btn btn-mobile-login" onClick={closeMobileMenu}>Login</Link>
                </div>
                <div className="mobile-menu-social mobile-social-anim">
                  {socialLinks.map(link => (
                    <a
                      key={link.id}
                      href={link.url}
                      className="mobile-social-link"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Follow us on ${link.label}`}
                      title={link.label}
                    >
                      {renderSocialGlyph(link)}
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mobile-menu-columns">
                <div className="mobile-menu-left">
                  <nav className="mobile-nav">
                    <ul className="mobile-nav-menu">
                      {menuItems.map((item, index) => (
                        <li
                          key={item.id}
                          className={`mobile-nav-item mobile-nav-item-anim${item.hasDropdown ? ' has-dropdown' : ''}${activeDropdown === item.id ? ' dropdown-open' : ''}`}
                          style={{ '--item-index': index }}
                        >
                          <div className="mobile-nav-item-inner">
                            <NavLink
                              to={item.hasDropdown ? '#' : item.path}
                              end={item.path === '/'}
                              className={({ isActive }) => `mobile-nav-link${isActive ? ' active' : ''}`}
                              onClick={(e) => {
                                if (item.hasDropdown) {
                                  e.preventDefault();
                                  toggleMobileDropdown(item.id);
                                } else {
                                  closeMobileMenu();
                                }
                              }}
                            >
                              {item.title}
                            </NavLink>
                            {item.hasDropdown ? (
                              <button
                                className={`mobile-arrow-toggle${activeDropdown === item.id ? ' open' : ''}`}
                                onClick={() => toggleMobileDropdown(item.id)}
                                aria-label={`Toggle ${item.title} submenu`}
                              >
                                →
                              </button>
                            ) : (
                              <Link
                                to={item.path}
                                className="mobile-nav-arrow mobile-nav-arrow-link"
                                onClick={closeMobileMenu}
                                aria-label={`Go to ${item.title}`}
                              >
                                →
                              </Link>
                            )}
                          </div>
                          {item.hasDropdown && (
                            <div className="mobile-nav-dropdown">
                              {item.dropdownItems.map((dropdownItem, idx) => (
                                <Link
                                  key={idx}
                                  to={dropdownItem.path}
                                  className="mobile-nav-dropdown-item"
                                  onClick={closeMobileMenu}
                                >
                                  {dropdownItem.title}
                                </Link>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </nav>
                  <div className="mobile-menu-left-divider" aria-hidden="true" />
                  <div className="mobile-auth-buttons mobile-auth-anim">
                    <Link to="/login" className="btn btn-mobile-login" onClick={closeMobileMenu}>Login</Link>
                  </div>
                  <div className="mobile-menu-social mobile-social-anim">
                    {socialLinks.map(link => (
                      <a
                        key={link.id}
                        href={link.url}
                        className="mobile-social-link"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Follow us on ${link.label}`}
                        title={link.label}
                      >
                        {renderSocialGlyph(link)}
                      </a>
                    ))}
                  </div>
                </div>
                <div className="mobile-menu-right mobile-right-anim">
                  <div className="mobile-menu-right-gp">
                    <p className="mobile-menu-gp-title">Have A Question?</p>
                    <a
                      href={`mailto:${INFO_EMAIL}`}
                      className="mobile-menu-email"
                      aria-label={`Send email to ${INFO_EMAIL}`}
                      onClick={(e) => {
                        navigateToMailto(INFO_EMAIL, e);
                        closeMobileMenu();
                      }}
                    >
                      {INFO_EMAIL}
                    </a>
                  </div>
                  <div className="mobile-menu-right-gp">
                    <p className="mobile-menu-gp-title">Where To Find Us?</p>
                    <Link to="/contact" className="mobile-menu-look-here" onClick={closeMobileMenu}>
                      <span>Look here</span>
                      <span className="mobile-menu-arrow" aria-hidden="true">→</span>
                    </Link>
                  </div>
                  <div className="mobile-menu-right-gp">
                    <p className="mobile-menu-gp-title">Want To Get Register?</p>
                    <Link to="/payment" className="mobile-menu-enroll" onClick={closeMobileMenu}>
                      Enroll Now
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 9-dot grid sidebar */}
      <div
        className={`menu-grid-panel ${isMenuOpen ? 'menu-grid-panel--open' : ''}`}
        ref={gridPanelRef}
        aria-hidden={!isMenuOpen}
      >
        <div className="menu-grid-container">
          <div className="menu-grid-header">
            <div className="menu-grid-logo">
              <div className="logo-text">
                <img className="logo-image" src={headerLogo} alt="GoRythm" />
              </div>

            </div>

            <button
              className="menu-grid-close"
              onClick={() => setIsMenuOpen(false)}
              aria-label="Close menu grid"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div className="menu-grid-content">
            <div className="social-links-list">
              {socialLinks.map(social => (
                <a
                  key={social.id}
                  href={social.url}
                  className="social-link-item"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Follow us on ${social.label}`}
                  title={`Follow us on ${social.label}`}
                >
                  <span className="social-icon">
                    {renderSocialGlyph(social)}
                  </span>
                  <span className="social-link-name">{social.label}</span>
                </a>
              ))}
            </div>
          </div>

          <div className="menu-grid-footer">
            <div className="contact-info">
              <div className="contact-item">
                <div className="contact-details">
                  <div className="contact-value">
                    <a href={`tel:${CONTACT_PHONE.replace(/\s/g, '')}`}>{CONTACT_PHONE}</a>
                  </div>
                </div>
              </div>

              <div className="contact-item">
                <div className="contact-details">
                  <div className="contact-value">
                    <a
                      href={`mailto:${INFO_EMAIL}`}
                      aria-label={`Send email to ${INFO_EMAIL}`}
                      onClick={(e) => navigateToMailto(INFO_EMAIL, e)}
                    >
                      {INFO_EMAIL}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Overlay for grid sidebar */}
      {isMenuOpen && <div className="menu-grid-overlay" onClick={() => setIsMenuOpen(false)} />}
    </>
  );
};

export default Header;