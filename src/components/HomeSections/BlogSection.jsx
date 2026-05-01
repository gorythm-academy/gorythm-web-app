// Blog Section – slider with 3 cards visible; data from blog page
// Auto left-to-right slider with dot indicators

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
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
  const mouseDragStartXRef = useRef(0);
  const isMouseDraggingRef = useRef(false);
  const didMouseDragRef = useRef(false);
  const [isInView, setIsInView] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoSlidePaused, setIsAutoSlidePaused] = useState(false);

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
    if (isAutoSlidePaused) return;
    const t = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % totalSlides);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(t);
  }, [totalSlides, isAutoSlidePaused]);

  const goToSlide = useCallback((index) => {
    if (!totalSlides) return;
    setCurrentSlide(Math.max(0, Math.min(index, totalSlides - 1)));
  }, [totalSlides]);

  const goToNext = useCallback(() => {
    if (totalSlides <= 1) return;
    setCurrentSlide((prev) => (prev + 1) % totalSlides);
  }, [totalSlides]);

  const goToPrev = useCallback(() => {
    if (totalSlides <= 1) return;
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  }, [totalSlides]);

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

  const handleMouseDown = (event) => {
    if (event.button !== 0 || totalSlides <= 1) return;
    event.preventDefault();
    mouseDragStartXRef.current = event.clientX;
    isMouseDraggingRef.current = true;
    didMouseDragRef.current = false;
  };

  useEffect(() => {
    const handleMouseMove = (event) => {
      if (!isMouseDraggingRef.current) return;
      const dragDelta = event.clientX - mouseDragStartXRef.current;
      if (Math.abs(dragDelta) > 4) {
        didMouseDragRef.current = true;
      }
    };

    const handleMouseUp = (event) => {
      if (!isMouseDraggingRef.current) return;
      const dragDelta = event.clientX - mouseDragStartXRef.current;
      isMouseDraggingRef.current = false;

      const threshold = 24;
      if (dragDelta <= -threshold) goToNext();
      else if (dragDelta >= threshold) goToPrev();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [goToNext, goToPrev]);

  const handleMouseClickCapture = (event) => {
    if (!didMouseDragRef.current) return;
    // Prevent opening a blog card link after a drag gesture.
    event.preventDefault();
    event.stopPropagation();
    didMouseDragRef.current = false;
  };

  const handleTouchCancel = () => {
    touchStartRef.current = null;
    touchGestureRef.current = { isHorizontalSwipe: false };
  };

  const handleBlur = () => {
    isMouseDraggingRef.current = false;
    didMouseDragRef.current = false;
    touchStartRef.current = null;
    touchGestureRef.current = { isHorizontalSwipe: false };
  };

  const handleDragStart = (event) => {
    // Stop native browser drag ghost image on links/text while dragging slider.
    event.preventDefault();
  };

  const handleMouseEnterSlider = () => {
    setIsAutoSlidePaused(true);
  };

  const handleMouseLeaveSlider = () => {
    setIsAutoSlidePaused(false);
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
          onMouseDown={handleMouseDown}
          onMouseEnter={handleMouseEnterSlider}
          onMouseLeave={handleMouseLeaveSlider}
          onClickCapture={handleMouseClickCapture}
          onTouchCancel={handleTouchCancel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onBlur={handleBlur}
          onDragStart={handleDragStart}
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
