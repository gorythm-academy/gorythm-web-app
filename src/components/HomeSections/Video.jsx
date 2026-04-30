// Video Section – full-width image banner with cursor-following PLAY button
// PLAY follows the mouse anywhere inside the section; opens Instagram reel in modal

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Video.scss';
import videoThumbnail from '../../assets/images/about us/video-thumbnail.png';

const VIDEO_EMBED = 'https://www.instagram.com/reel/DMCsgSoNFVQ/embed';

const VideoSection = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInView, setIsInView]       = useState(false);
  const [isHovering, setIsHovering]   = useState(false);

  // Cursor position as percentage of section dimensions (0–100)
  // Default: exact center (50, 50)
  const [btnPos, setBtnPos] = useState({ x: 50, y: 50 });

  const sectionRef = useRef(null);

  // ── Intersection Observer – show PLAY button on scroll-in ─────────────────
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsInView(true); },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── Cursor tracking inside the section ────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    const rect = sectionRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width)  * 100;
    const y = ((e.clientY - rect.top)  / rect.height) * 100;
    setBtnPos({ x, y });
  }, []);

  const handleMouseEnter = () => setIsHovering(true);

  const handleMouseLeave = () => {
    setIsHovering(false);
    // Smoothly return to center on leave
    setBtnPos({ x: 50, y: 50 });
  };

  // ── Keyboard close + body scroll lock when modal open ────────────────────
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') setIsModalOpen(false); };
    if (isModalOpen) {
      document.addEventListener('keydown', handleKey);
      document.body.style.overflow = 'hidden';
    } else {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    }
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [isModalOpen]);

  return (
    <>
      <section
        ref={sectionRef}
        className={`video-section${isInView ? ' video-inview' : ''}${isHovering ? ' video-hovering' : ''}`}
        style={{
          backgroundImage: `url(${videoThumbnail})`,
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Dark overlay */}
        <div className="video-section-overlay" />

        {/* PLAY button – absolutely positioned, follows cursor via inline style */}
        <button
          className="video-play-btn"
          style={{
            left: `${btnPos.x}%`,
            top:  `${btnPos.y}%`,
          }}
          onClick={() => setIsModalOpen(true)}
          aria-label="Play video"
          type="button"
        >
          <span className="video-play-ring" aria-hidden="true" />
          <span className="video-play-text">PLAY</span>
        </button>
      </section>

      {/* ── Video modal ─────────────────────────────────────────────────────── */}
      {isModalOpen && (
        <div
          className="video-modal-overlay"
          onClick={() => setIsModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Video player"
        >
          <div
            className="video-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="video-modal-close"
              onClick={() => setIsModalOpen(false)}
              aria-label="Close video"
              type="button"
            >
              ✕
            </button>
            <div className="video-modal-embed">
              <iframe
                src={VIDEO_EMBED}
                title="Instagram Reel"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default VideoSection;
