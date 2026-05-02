// Video Section – full-width image banner with cursor-following PLAY button
// PLAY follows the mouse; Instagram reel plays inline inside this section only

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Video.scss';
import videoThumbnail from '../../assets/images/about us/video-thumbnail.png';

const VIDEO_EMBED = 'https://www.instagram.com/reel/DMCsgSoNFVQ/embed';

const VideoSection = () => {
  const [isPlaying, setIsPlaying] = useState(false);
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

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') setIsPlaying(false);
    };
    if (!isPlaying) return undefined;
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isPlaying]);

  return (
    <section
      ref={sectionRef}
      className={`video-section${isInView ? ' video-inview' : ''}${isHovering ? ' video-hovering' : ''}${isPlaying ? ' video-section--playing' : ''}`}
      style={{
        backgroundImage: `url(${videoThumbnail})`,
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="video-section-overlay" />

      <button
        className="video-play-btn"
        style={{
          left: `${btnPos.x}%`,
          top: `${btnPos.y}%`,
        }}
        onClick={() => setIsPlaying(true)}
        aria-label="Play video"
        type="button"
      >
        <span className="video-play-ring" aria-hidden="true" />
        <span className="video-play-text">PLAY</span>
      </button>

      {isPlaying && (
        <div
          className="video-section-player"
          role="region"
          aria-label="Instagram video"
        >
          <button
            className="video-section-player-close"
            onClick={() => setIsPlaying(false)}
            aria-label="Close video"
            type="button"
          >
            ✕
          </button>
          <div className="video-section-player-fit">
            <div className="video-section-embed">
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
    </section>
  );
};

export default VideoSection;
