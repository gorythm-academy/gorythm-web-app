// Video Section – full-width image banner; PLAY centered; tap/click section to play

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Player from '@vimeo/player';
import OptimizedPicture from '../OptimizedPicture/OptimizedPicture';
import './Video.scss';

import videoThumbPng from '../../assets/images/about us/video-thumbnail.png';
import videoThumbWebp from '../../assets/images/about us/video-thumbnail.webp';
import videoThumbAvif from '../../assets/images/about us/video-thumbnail.avif';

/** Vimeo embed (`h` for unlisted). `api=1` enables @vimeo/player (tap-to-toggle on the picture). */
const VIMEO_EMBED_SRC =
  'https://player.vimeo.com/video/1189986115?h=7ea39a6e1f&autoplay=1&playsinline=1&title=0&byline=0&portrait=0&api=1';

const VideoSection = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInView, setIsInView]       = useState(false);

  const sectionRef = useRef(null);
  const iframeRef = useRef(null);
  const vimeoPlayerRef = useRef(null);

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

  const openVideo = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const handleSectionClick = useCallback(() => {
    if (!isPlaying) openVideo();
  }, [isPlaying, openVideo]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') setIsPlaying(false);
    };
    if (!isPlaying) return undefined;
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying || !iframeRef.current) return undefined;
    const iframe = iframeRef.current;
    const player = new Player(iframe);
    vimeoPlayerRef.current = player;
    return () => {
      vimeoPlayerRef.current = null;
      player.destroy().catch(() => {});
    };
  }, [isPlaying]);

  const handleVideoSurfaceToggle = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const player = vimeoPlayerRef.current;
    if (!player) return;
    try {
      await player.ready();
      const paused = await player.getPaused();
      if (paused) await player.play();
      else await player.pause();
    } catch {
      /* iframe may unload during navigation */
    }
  }, []);

  // Fullscreen mode previously locked body scroll here.
  // Player is now constrained to this section, so no body overflow lock is needed.

  return (
    <section
      ref={sectionRef}
      className={`video-section${isInView ? ' video-inview' : ''}${isPlaying ? ' video-section--playing' : ''}`}
      onClick={isPlaying ? undefined : handleSectionClick}
    >
      {/* Raster backdrop replaces CSS background-image so we can ship AVIF/WebP (<picture>) */}
      <div className="video-section-backdrop" aria-hidden="true">
        <OptimizedPicture
          avifSrc={videoThumbAvif}
          webpSrc={videoThumbWebp}
          fallbackSrc={videoThumbPng}
          alt=""
          loading="lazy"
          pictureClassName="video-section-backdrop-picture"
          className="video-section-backdrop-img"
          width={1600}
          height={900}
        />
      </div>
      <div className="video-section-overlay" />

      <button
        className="video-play-btn"
        onClick={(e) => {
          e.stopPropagation();
          openVideo();
        }}
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
          aria-label="Intro video"
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
              <div className="video-section-embed-inner">
                <iframe
                  ref={iframeRef}
                  title="vimeo-player"
                  src={VIMEO_EMBED_SRC}
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
                  allowFullScreen
                />
                {/* Vimeo often only toggles from the chrome bar; this layer toggles play/pause on the picture. */}
                <button
                  type="button"
                  className="video-section-embed-tap"
                  aria-label="Pause or play video"
                  onClick={handleVideoSurfaceToggle}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default VideoSection;
