// Blog Section – slider with 3 cards visible; data from blog page
// Auto left-to-right slider with dot indicators

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { blogPosts } from '../Pages/BlogData';
import './BlogSection.scss';

const CARDS_PER_SLIDE = 3;
const AUTO_ADVANCE_MS = 5000;

const BlogSection = () => {
  const sectionRef = useRef(null);
  const sliderRef = useRef(null);
  const touchStartRef = useRef(null); // { x, y }
  const touchGestureRef = useRef({ isHorizontalSwipe: false });
  const [isInView, setIsInView] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = useMemo(() => {
    const list = [...blogPosts];
    const chunks = [];
    for (let i = 0; i < list.length; i += CARDS_PER_SLIDE) {
      chunks.push(list.slice(i, i + CARDS_PER_SLIDE));
    }
    return chunks;
  }, []);

  const totalSlides = slides.length;

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsInView(true); },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (totalSlides <= 1) return;
    const t = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % totalSlides);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(t);
  }, [totalSlides]);

  const goToSlide = (index) => {
    if (!totalSlides) return;
    setCurrentSlide(Math.max(0, Math.min(index, totalSlides - 1)));
  };

  const goToNext = () => {
    if (totalSlides <= 1) return;
    setCurrentSlide((prev) => (prev + 1) % totalSlides);
  };

  const goToPrev = () => {
    if (totalSlides <= 1) return;
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  const handleTouchStart = (e) => {
    const touch = e.touches?.[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    touchGestureRef.current = { isHorizontalSwipe: false };
  };

  const handleTouchMove = (e) => {
    const start = touchStartRef.current;
    const touch = e.touches?.[0];
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    // Mark horizontal swipe intent early; this prevents taps from being misread
    // and lets us treat "small movement" touches as taps.
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
      touchGestureRef.current.isHorizontalSwipe = true;
    }
  };

  const handleTouchEnd = (e) => {
    const start = touchStartRef.current;
    const touch = e.changedTouches?.[0];
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    touchStartRef.current = null;

    const threshold = 40;
    if (!touchGestureRef.current.isHorizontalSwipe) return;
    if (Math.abs(dx) < threshold) return;

    if (dx < 0) goToNext();
    else goToPrev();
  };

  return (
    <section
      ref={sectionRef}
      className={`blog-section scheme_dark${isInView ? ' blog-inview' : ''}`}
    >
      <div className="blog-inner">
        <header className="blog-header">
          <p className="blog-eyebrow blog_anim">From the blog</p>
          <h2 className="blog-title blog_anim">Insights for the Heart and Mind</h2>
        </header>

        <div
          className="blog-slider"
          ref={sliderRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="blog-slider-track"
            style={{
              '--blog-slides': totalSlides,
              width: `${totalSlides * 100}%`,
              transform: `translateX(-${currentSlide * (100 / totalSlides)}%)`,
            }}
            aria-live="polite"
            aria-label={`Slide ${currentSlide + 1} of ${totalSlides}`}
          >
            {slides.map((slidePosts, slideIdx) => (
              <div key={slideIdx} className="blog-slide" aria-hidden={slideIdx !== currentSlide}>
                <div className="blog-grid">
                  {slidePosts.map((post, idx) => (
                    <Link
                      key={post.id}
                      to={`/blog/${post.slug}`}
                      className={`blog-card blog_anim blog-card-${idx + 1}`}
                    >
                      <div className="blog-card-meta">
                        <span className="blog-card-eyebrow">{post.category}</span>
                        <span className="blog-card-dot" aria-hidden="true">·</span>
                        <span className="blog-card-date">{post.date}</span>
                      </div>
                      <h3 className="blog-card-title">{post.title}</h3>
                      <p className="blog-card-description">{post.excerpt}</p>
                      <span className="blog-card-arrow" aria-hidden="true">
                        <span className="blog-card-arrow-inner">→</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {totalSlides > 1 && (
            <div className="blog-dots" role="tablist" aria-label="Slider dots">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  role="tab"
                  aria-selected={idx === currentSlide}
                  aria-label={`Go to slide ${idx + 1}`}
                  className={`blog-dot${idx === currentSlide ? ' active' : ''}`}
                  onClick={() => goToSlide(idx)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="blog-cta-wrap">
          <Link to="/blog" className="blog-cta blog_anim">
            View all blogs
          </Link>
        </div>
      </div>
    </section>
  );
};

export default BlogSection;
