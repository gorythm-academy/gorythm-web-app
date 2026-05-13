import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import OptimizedPicture from '../OptimizedPicture/OptimizedPicture';
import heroBannerPng from '../../assets/images/home/hero-banner-image.png';
import centerLogoPng from '../../assets/images/home/center-logo.png';
import centerLogoWebp from '../../assets/images/home/center-logo.webp';
import centerLogoAvif from '../../assets/images/home/center-logo.avif';
import './Hero.scss';

/**
 * Stable URLs under `public/preload/` — duplicated from bundled PNG by `npm run optimize-images`.
 * Lets `public/index.html` `<link rel="preload">` discover the same bytes the `<picture>` picks first (AVIF-capable browsers).
 */
const PUBLIC = process.env.PUBLIC_URL || '';
const HERO_LCP_AVIF = `${PUBLIC}/preload/lcp-hero.avif`;
const HERO_LCP_WEBP = `${PUBLIC}/preload/lcp-hero.webp`;

gsap.registerPlugin(ScrollTrigger);

const HeroSection = () => {

  const heroRef = useRef(null);
  const particlesRef = useRef([]);

  const centerImageRef = useRef(null);
  const bgRef = useRef(null);

  useEffect(() => {

    // ===== PARTICLE ANIMATIONS =====
    particlesRef.current.forEach((particle, i) => {
      gsap.to(particle, {
        y: -20,
        rotation: 360,
        duration: 3 + i,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut"
      });
    });

    // ==================================================
    // BACKGROUND SLOW ZOOM (Ken burns)
    // ==================================================
    if (bgRef.current) {
      gsap.fromTo(
        bgRef.current,
        { scale: 1 },
        {
          scale: 1,
          duration: 80,
          ease: "none"
        }
      );
    }

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

    // very subtle like stargaze
    const moveX = 18;
    const moveY = 12;

    gsap.to(centerImageRef.current, {
      x: -normX * moveX,
      y: -normY * moveY,
      duration: 0.9,
      ease: "power3.out",
      overwrite: true
    });
  };

  const handleParallaxLeave = () => {

    if (!centerImageRef.current) return;

    gsap.to(centerImageRef.current, {
      x: 0,
      y: 0,
      duration: 1.2,
      ease: "power3.out"
    });
  };

  const heroData = {
    caption: "YOU ARE BUILT WITH",
    caption2: "SIGNS",
    caption3: "DISCOVER YOURSELF",
    description:
    "Gorythm is a research centre & development platform dedicated to intellectual, emotional, & physical growth delivering structured, purposeful learning for every stage of life",
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
      <div ref={bgRef} className="hero-background zoomed-bg">
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

      <div className="hero-container">
        <div className="hero-content">

          <div className="hero-title-wrapper">

            {/* NEW small caption above title – animated entrance */}
            {/* <motion.div
              className="hero-eyebrow"
              initial={{ opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0, ease: [0.22, 1, 0.36, 1] }}
            >
              Premium Education Platform
              A project of Alfarhan
            </motion.div> */}

            <div className="hero-title-block">
              <div className="hero-title-line-1">

                <motion.span
                  className="hero-title-word"
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                >
                  {heroData.caption}
                </motion.span>

                {/* ===== CENTER IMAGE ===== */}
                <motion.div
                  ref={centerImageRef}
                  className="hero-center-image"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8, delay: 0.4 }}
                >
                  {/* Decorative mark between title words — empty alt; smaller than sky background */}
                  <OptimizedPicture
                    avifSrc={centerLogoAvif}
                    webpSrc={centerLogoWebp}
                    fallbackSrc={centerLogoPng}
                    alt=""
                    width={800}
                    height={500}
                    fetchPriority="high"
                    decoding="async"
                  />
                </motion.div>

                <motion.span
                  className="hero-title-word"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.6 }}
                >
                  {heroData.caption2}
                </motion.span>

              </div>

              <motion.div
                className="hero-title-line-2"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.8 }}
              >
                <h2 className="hero-subtitle">
                  {heroData.caption3}
                </h2>
              </motion.div>
            </div>

          </div>

          <motion.div
            className="hero-description-container"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, delay: 1.0 }}
          >
            <p className="hero-description">
              {heroData.description}
            </p>
          </motion.div>

        </div>
      </div>

    </section>
  );
};

export default HeroSection;
