import React, { useEffect, useRef } from 'react';
import heroBannerPng from '../../assets/images/home/hero-banner-image.png';
import { HERO_CENTER_LOGO_AVIF, HERO_CENTER_LOGO_WEBP } from '../../config/publicAssets';
import { PUBLIC_URL } from '../../config/env';
import './Hero.scss';

/**
 * Stable URLs under `public/preload/` — duplicated from bundled PNG by `npm run optimize-images`.
 * Lets `public/index.html` `<link rel="preload">` discover the same bytes the `<picture>` picks first (AVIF-capable browsers).
 */
const PUBLIC = PUBLIC_URL;
const HERO_LCP_AVIF = `${PUBLIC}/preload/lcp-hero.avif`;
const HERO_LCP_WEBP = `${PUBLIC}/preload/lcp-hero.webp`;

let gsapPromise;
function loadGsap() {
  if (!gsapPromise) gsapPromise = import('gsap').then((mod) => mod.gsap);
  return gsapPromise;
}

const HeroSection = () => {

  const heroRef = useRef(null);
  const particlesRef = useRef([]);

  const centerImageRef = useRef(null);

  useEffect(() => {
    const publicUrl = PUBLIC_URL;
    const links = [
      [`${publicUrl}/images/hero/center-logo-240.avif`, 'image/avif'],
      [`${publicUrl}/preload/lcp-hero.avif`, 'image/avif'],
    ].map(([href, type]) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = href;
      link.type = type;
      link.dataset.heroPreload = '1';
      document.head.appendChild(link);
      return link;
    });
    return () => {
      links.forEach((link) => link.remove());
    };
  }, []);

  useEffect(() => {

    // ===== PARTICLE ANIMATIONS =====
    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return undefined;

    const centerEl = centerImageRef.current;
    let cancelled = false;
    let tweens = [];
    loadGsap().then((gsap) => {
      if (cancelled) return;
      tweens = particlesRef.current.filter(Boolean).map((particle, i) =>
        gsap.to(particle, {
          y: -20,
          rotation: 360,
          duration: 3 + i,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut"
        })
      );
    });

    // These tweens repeat forever: stop them when leaving the page.
    return () => {
      cancelled = true;
      tweens.forEach((tween) => tween.kill());
      if (centerEl) loadGsap().then((gsap) => gsap.killTweensOf(centerEl));
    };
  }, []);

  // ==================================================
  // CENTER IMAGE PARALLAX (OPPOSITE TO CURSOR)
  // ==================================================

  const handleParallaxMove = (e) => {

    if (!heroRef.current || !centerImageRef.current) return;

    const heroRect = heroRef.current.getBoundingClientRect();

    const x = e.clientX - heroRect.left;
    const y = e.clientY - heroRect.top;

    const normX = x / heroRect.width - 0.5;
    const normY = y / heroRect.height - 0.5;

    const moveX = 18;
    const moveY = 12;

    const target = centerImageRef.current;
    loadGsap().then((gsap) => {
      if (target !== centerImageRef.current) return;
      gsap.to(target, {
        x: -normX * moveX,
        y: -normY * moveY,
        duration: 0.9,
        ease: "power3.out",
        overwrite: true
      });
    });
  };

  const handleParallaxLeave = () => {

    if (!centerImageRef.current) return;

    const target = centerImageRef.current;
    loadGsap().then((gsap) => {
      if (!target) return;
      gsap.to(target, {
        x: 0,
        y: 0,
        duration: 1.2,
        ease: "power3.out"
      });
    });
  };

  const heroData = {
    caption: "YOU ARE BUILT WITH",
    caption2: "SIGNS",
    caption3: "DISCOVER YOURSELF",
    description:
    "Gorythm Academy is a research centre and development platform, dedicated to intellectual, emotional, and physical growth, delivering structured and purposeful learning for every stage of life.",
    particles: [
      { top: '15%', left: '5%', size: '4px' },
      { top: '70%', left: '90%', size: '6px' },
      { top: '45%', left: '80%', size: '3px' },
      { top: '85%', left: '15%', size: '5px' },
      { top: '25%', left: '60%', size: '4px' }
    ]
  };

  return (
    <section
      className="hero-section-enhanced"
      ref={heroRef}
      onMouseMove={handleParallaxMove}
      onMouseLeave={handleParallaxLeave}
    >

      <div className="particles-container">
        {heroData.particles.map((particle, i) => (
          <div
            key={i}
            ref={el => particlesRef.current[i] = el}
            className="particle"
            style={{
              top: particle.top,
              left: particle.left,
              width: particle.size,
              height: particle.size
            }}
          />
        ))}
      </div>

      {/* ===== BACKGROUND (LCP) — AVIF/WebP from /public/preload; PNG fallback stays in the JS bundle */}
      <div className="hero-background zoomed-bg">
        <picture className="hero-background-picture">
          <source srcSet={HERO_LCP_AVIF} type="image/avif" />
          <source srcSet={HERO_LCP_WEBP} type="image/webp" />
          <img
            src={heroBannerPng}
            alt=""
            aria-hidden
            className="hero-background-fill"
            fetchPriority="high"
            decoding="async"
            width={1920}
            height={1080}
          />
        </picture>
        <div className="gradient-overlay"></div>
      </div>

      <h1 className="hero-sr-only">Gorythm Academy</h1>
      <div className="hero-container">
        <div className="hero-content">

          <div className="hero-title-wrapper">

            <div className="hero-title-block">
              <div className="hero-title-line-1">

                <span className="hero-title-word hero-rise-left">
                  {heroData.caption}
                </span>

                <span className="hero-title-word hero-rise-right">
                  {heroData.caption2}
                </span>

              </div>

              <div className="hero-title-line-2 hero-rise-line">
                <h2 className="hero-subtitle">
                  {heroData.caption3}
                </h2>

                <div className="hero-center-image hero-rise-logo">
                  <div ref={centerImageRef} className="hero-center-parallax">
                  <picture className="optimized-picture hero-center-logo-picture">
                    <source srcSet={HERO_CENTER_LOGO_AVIF} type="image/avif" />
                    <source srcSet={HERO_CENTER_LOGO_WEBP} type="image/webp" />
                    <img
                      src={HERO_CENTER_LOGO_WEBP}
                      alt=""
                      width={240}
                      height={264}
                      sizes="(max-width: 768px) 12vw, 96px"
                      fetchPriority="high"
                      decoding="async"
                    />
                  </picture>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div className="hero-description-container hero-rise-copy">
            <p className="hero-description">
              {heroData.description}
            </p>
          </div>

        </div>
      </div>

    </section>
  );
};

export default HeroSection;
