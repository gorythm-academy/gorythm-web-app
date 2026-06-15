// Video Section – full-width image banner; PLAY centered; tap/click section to play

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import Player from '@vimeo/player';
import { API_BASE_URL } from '../../config/constants';
import { resolveMediaUrl } from '../../utils/resolveMediaUrl';
import OptimizedPicture from '../OptimizedPicture/OptimizedPicture';
import './Video.scss';

import videoThumbPng from '../../assets/images/about us/video-thumbnail.png';
import videoThumbWebp from '../../assets/images/about us/video-thumbnail.webp';
import videoThumbAvif from '../../assets/images/about us/video-thumbnail.avif';

/** Fallback when no admin promo video is assigned for this placement */
const FALLBACK_VIMEO_EMBED_SRC =
  'https://player.vimeo.com/video/1189986115?h=7ea39a6e1f&autoplay=1&playsinline=1&title=0&byline=0&portrait=0&api=1';

const PLACEMENTS = {
  home: 'home',
  about: 'about',
};

/**
 * @param {{ placement?: 'home' | 'about' }} props
 */
const VideoSection = ({ placement = PLACEMENTS.home }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [promo, setPromo] = useState(null);
  const [promoLoaded, setPromoLoaded] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);

  const sectionRef = useRef(null);
  const iframeRef = useRef(null);
  const vimeoPlayerRef = useRef(null);

  const placementKey = placement === PLACEMENTS.about ? 'about' : 'home';

  useEffect(() => {
    let cancelled = false;
    setPromoLoaded(false);
    const base = (API_BASE_URL || '').replace(/\/$/, '');
    axios
      .get(`${base}/api/promo-videos/active/${placementKey}`)
      .then((res) => {
        if (!cancelled) setPromo(res.data?.video || null);
      })
      .catch(() => {
        if (!cancelled) setPromo(null);
      })
      .finally(() => {
        if (!cancelled) setPromoLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [placementKey]);

  const embedSrc = promo?.embedSrc || FALLBACK_VIMEO_EMBED_SRC;
  const provider = promo?.provider || 'vimeo';
  const isVimeo = provider === 'vimeo';
  const thumbUrl = promo?.thumbnailPath ? resolveMediaUrl(promo.thumbnailPath) : '';
  const thumbAlt = promo?.name ? `${promo.name} video thumbnail` : 'Video thumbnail';

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsInView(true);
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const openVideo = useCallback(() => {
    setVideoEnded(false);
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
    if (!isPlaying || !isVimeo || !iframeRef.current) return undefined;
    const iframe = iframeRef.current;
    const player = new Player(iframe);
    vimeoPlayerRef.current = player;

    const onEnded = () => setVideoEnded(true);
    const onPlay = () => setVideoEnded(false);

    player.on('ended', onEnded);
    player.on('play', onPlay);

    return () => {
      player.off('ended', onEnded);
      player.off('play', onPlay);
      vimeoPlayerRef.current = null;
      player.destroy().catch(() => {});
    };
  }, [isPlaying, isVimeo, embedSrc]);

  const handleReplay = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const player = vimeoPlayerRef.current;
    if (!player) return;
    try {
      await player.ready();
      await player.setCurrentTime(0);
      await player.play();
      setVideoEnded(false);
    } catch {
      /* iframe may unload during navigation */
    }
  }, []);

  const handleVideoSurfaceToggle = useCallback(
    async (e) => {
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
    },
    []
  );

  if (!promoLoaded) {
    return (
      <section
        ref={sectionRef}
        className="video-section video-section--loading"
        aria-hidden="true"
      />
    );
  }

  return (
    <section
      ref={sectionRef}
      className={`video-section${isInView ? ' video-inview' : ''}${isPlaying ? ' video-section--playing' : ''}`}
      onClick={isPlaying ? undefined : handleSectionClick}
    >
      <div className="video-section-backdrop" aria-hidden="true">
        {thumbUrl ? (
          <img
            className="video-section-backdrop-img"
            src={thumbUrl}
            alt={thumbAlt}
            loading="lazy"
            width={1600}
            height={900}
          />
        ) : (
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
            sizes="(max-width: 768px) 100vw, min(100vw, 900px)"
          />
        )}
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
        <div className="video-section-player" role="region" aria-label="Intro video">
          <button
            className="video-section-player-close"
            onClick={() => {
              setVideoEnded(false);
              setIsPlaying(false);
            }}
            aria-label="Close video"
            type="button"
          >
            ✕
          </button>
          <div className="video-section-player-fit">
            <div className="video-section-embed">
              <div
                className={`video-section-embed-inner${videoEnded ? ' video-section-embed-inner--ended' : ''}`}
              >
                <iframe
                  ref={iframeRef}
                  title={promo?.name || 'Video player'}
                  src={embedSrc}
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
                  allowFullScreen
                />
                {isVimeo && !videoEnded ? (
                  <button
                    type="button"
                    className="video-section-embed-tap"
                    aria-label="Pause or play video"
                    onClick={handleVideoSurfaceToggle}
                  />
                ) : null}
                {isVimeo && videoEnded ? (
                  <button
                    type="button"
                    className="video-section-replay"
                    aria-label="Replay video"
                    onClick={handleReplay}
                  >
                    <span className="video-section-replay-icon" aria-hidden="true">
                      <i className="fas fa-redo" />
                    </span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default VideoSection;
