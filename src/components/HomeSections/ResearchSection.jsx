// Homepage research slider — 3 cards per slide when enough posts exist

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchPublishedResearchPosts } from '../../utils/researchPosts';
import './ResearchSection.scss';

const CARDS_PER_SLIDE = 3;
const AUTO_ADVANCE_MS = 5000;
// Matches the phone breakpoint in ResearchSection.scss ($bp-sm - 1).
const PORTRAIT_PHONE_QUERY = '(max-width: 767px) and (orientation: portrait)';
const PORTRAIT_DOT_COUNT = 3;

function portraitDotIndexes(active, count) {
  const total = Math.max(0, count);
  if (total <= 1) return [];
  const safeActive = Math.max(0, Math.min(active, total - 1));
  if (total <= PORTRAIT_DOT_COUNT) {
    return Array.from({ length: total }, (_, index) => index);
  }
  const start = Math.min(Math.max(safeActive - 1, 0), total - PORTRAIT_DOT_COUNT);
  return Array.from({ length: PORTRAIT_DOT_COUNT }, (_, index) => start + index);
}

const ResearchSection = () => {
  const sectionRef = useRef(null);
  const sliderRef = useRef(null);
  const mouseDragStartXRef = useRef(0);
  const isMouseDraggingRef = useRef(false);
  const didMouseDragRef = useRef(false);
  const didTouchSwipeRef = useRef(false);
  const portraitTouchPausedRef = useRef(false);
  const [isInView, setIsInView] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoSlidePaused, setIsAutoSlidePaused] = useState(false);
  const [isPortraitPhone, setIsPortraitPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PORTRAIT_PHONE_QUERY).matches
  );

  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState(false);
  const [portraitIndex, setPortraitIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPostsLoading(true);
    setPostsError(false);
    fetchPublishedResearchPosts()
      .then(({ posts: merged, error }) => {
        if (cancelled) return;
        setPosts(merged);
        setPostsError(Boolean(error));
      })
      .catch(() => {
        if (!cancelled) {
          setPosts([]);
          setPostsError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setPostsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const slides = useMemo(() => {
    const list = [...posts];
    const chunks = [];
    for (let i = 0; i < list.length; i += CARDS_PER_SLIDE) {
      chunks.push(list.slice(i, i + CARDS_PER_SLIDE));
    }
    return chunks;
  }, [posts]);

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
    const media = window.matchMedia(PORTRAIT_PHONE_QUERY);
    const sync = () => setIsPortraitPhone(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (isPortraitPhone) return;
    if (totalSlides <= 1) return;
    if (isAutoSlidePaused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % totalSlides);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(t);
  }, [isPortraitPhone, totalSlides, isAutoSlidePaused]);

  // Phone portrait uses a native horizontal scroller (one card wide).
  // Auto-advance only once there is a fourth card, same as the paged slider.
  useEffect(() => {
    if (!isPortraitPhone || posts.length <= CARDS_PER_SLIDE || isAutoSlidePaused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = sliderRef.current;
    if (!el) return;
    const timer = window.setInterval(() => {
      if (portraitTouchPausedRef.current) return;
      const card = el.querySelector('.research-card');
      if (!card) return;
      const gap = parseFloat(window.getComputedStyle(el).columnGap || window.getComputedStyle(el).gap) || 0;
      const step = card.offsetWidth + gap;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const atEnd = el.scrollLeft >= max - 2;
      el.scrollTo({
        left: atEnd ? 0 : Math.min(max, el.scrollLeft + step),
        behavior: 'smooth',
      });
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [isPortraitPhone, posts.length, postsLoading, isAutoSlidePaused]);

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

  // React's touchmove listener is passive, so it cannot cancel the page scroll.
  // On a phone the browser then fires touchcancel and the slide never changes.
  // A non-passive listener claims horizontal swipes before that happens.
  useEffect(() => {
    if (isPortraitPhone) return undefined;
    const el = sliderRef.current;
    if (!el || totalSlides <= 1) return undefined;

    let startX = 0;
    let startY = 0;
    let axis = null;
    let dx = 0;

    const onStart = (event) => {
      const touch = event.touches?.[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      axis = null;
      dx = 0;
      setIsAutoSlidePaused(true);
    };

    const onMove = (event) => {
      const touch = event.touches?.[0];
      if (!touch || axis === 'y') return;
      dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (!axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      if (axis === 'x') event.preventDefault();
    };

    const onFinish = () => {
      if (axis === 'x' && Math.abs(dx) > 12) {
        didTouchSwipeRef.current = true;
        window.setTimeout(() => {
          didTouchSwipeRef.current = false;
        }, 500);
      }
      if (axis === 'x' && Math.abs(dx) >= 40) {
        if (dx < 0) goToNext();
        else goToPrev();
      }
      axis = null;
      setIsAutoSlidePaused(false);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onFinish);
    el.addEventListener('touchcancel', onFinish);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onFinish);
      el.removeEventListener('touchcancel', onFinish);
    };
  }, [isPortraitPhone, totalSlides, goToNext, goToPrev, postsLoading]);

  const handleMouseDown = (event) => {
    if (isPortraitPhone || event.button !== 0 || totalSlides <= 1) return;
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
    if (!didMouseDragRef.current && !didTouchSwipeRef.current) return;
    // Prevent opening a blog card link after a drag or swipe.
    event.preventDefault();
    event.stopPropagation();
    didMouseDragRef.current = false;
    didTouchSwipeRef.current = false;
  };

  const handleBlur = () => {
    isMouseDraggingRef.current = false;
    didMouseDragRef.current = false;
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

  const handlePortraitScroll = () => {
    const el = sliderRef.current;
    const card = el?.querySelector('.research-card');
    if (!el || !card) return;
    const gap = parseFloat(window.getComputedStyle(el).columnGap || window.getComputedStyle(el).gap) || 0;
    const step = card.offsetWidth + gap;
    if (step <= 0) return;
    const index = Math.max(0, Math.min(posts.length - 1, Math.round(el.scrollLeft / step)));
    setPortraitIndex((prev) => (prev === index ? prev : index));
  };

  const scrollToPortraitCard = (index) => {
    const el = sliderRef.current;
    const card = el?.querySelectorAll('.research-card')[index];
    if (!el || !card) return;
    el.scrollTo({ left: card.offsetLeft, behavior: 'smooth' });
  };

  return (
    <section
      ref={sectionRef}
      className={`research-section scheme_dark${isInView ? ' research-inview' : ''}`}
    >
      <div className="research-inner">
        <header className="research-header">
          <p className="research-eyebrow research_anim">Our research work</p>
          <h2 className="research-title research_anim">Insights for the Heart and Mind</h2>
        </header>

        {postsLoading ? (
          <div className="research-slider-status" aria-live="polite">
            <p>Loading research…</p>
          </div>
        ) : totalSlides === 0 ? (
          <div className="research-slider-status" aria-live="polite">
            <p className="research-slider-status-title">
              {postsError ? 'Could not load research' : 'No research posts yet'}
            </p>
            <p className="research-slider-status-desc">
              {postsError
                ? 'Please try again in a moment.'
                : 'New articles will appear here when they are published.'}
            </p>
          </div>
        ) : isPortraitPhone ? (
        <>
        <div
          className="research-slider research-slider--portrait"
          ref={sliderRef}
          onMouseEnter={handleMouseEnterSlider}
          onMouseLeave={handleMouseLeaveSlider}
          onScroll={handlePortraitScroll}
          onTouchStart={() => { portraitTouchPausedRef.current = true; }}
          onTouchEnd={() => { portraitTouchPausedRef.current = false; }}
          onTouchCancel={() => { portraitTouchPausedRef.current = false; }}
        >
          {posts.map((post, idx) => (
            <Link
              key={post.id || post.slug}
              to={`/research/${post.slug}`}
              className={`research-card research_anim research-card-${(idx % CARDS_PER_SLIDE) + 1}`}
            >
              <div className="research-card-meta">
                <span className="research-card-eyebrow">{post.category}</span>
                <span className="research-card-dot" aria-hidden="true">·</span>
                <span className="research-card-date">{post.date}</span>
              </div>
              <h3 className="research-card-title">{post.title}</h3>
              <p className="research-card-description">{post.excerpt}</p>
              <span className="research-card-arrow" aria-hidden="true">
                <span className="research-card-arrow-inner">→</span>
              </span>
            </Link>
          ))}
        </div>
        {posts.length > 1 && (
          <div className="research-dots" role="tablist" aria-label="Card dots">
            {portraitDotIndexes(portraitIndex, posts.length).map((cardIndex) => (
              <button
                key={cardIndex}
                type="button"
                role="tab"
                aria-selected={cardIndex === portraitIndex}
                aria-label={`Go to card ${cardIndex + 1}`}
                className={`research-dot${cardIndex === portraitIndex ? ' active' : ''}`}
                onClick={() => scrollToPortraitCard(cardIndex)}
              />
            ))}
          </div>
        )}
        </>
        ) : (
        <div
          className="research-slider"
          ref={sliderRef}
          onMouseDown={handleMouseDown}
          onMouseEnter={handleMouseEnterSlider}
          onMouseLeave={handleMouseLeaveSlider}
          onClickCapture={handleMouseClickCapture}
          onBlur={handleBlur}
          onDragStart={handleDragStart}
        >
          <div
            className="research-slider-track"
            style={{
              '--research-slides': totalSlides,
              width: `${totalSlides * 100}%`,
              transform: `translateX(-${currentSlide * (100 / totalSlides)}%)`,
            }}
            aria-live="polite"
            aria-label={`Slide ${currentSlide + 1} of ${totalSlides}`}
          >
            {slides.map((slidePosts, slideIdx) => (
              <div key={slideIdx} className="research-slide" aria-hidden={slideIdx !== currentSlide}>
                <div
                  className="research-grid"
                  style={{ gridTemplateColumns: `repeat(${Math.min(slidePosts.length, CARDS_PER_SLIDE)}, 1fr)` }}
                >
                  {slidePosts.map((post, idx) => (
                    <Link
                      key={post.id || post.slug}
                      to={`/research/${post.slug}`}
                      className={`research-card research_anim research-card-${idx + 1}`}
                    >
                      <div className="research-card-meta">
                        <span className="research-card-eyebrow">{post.category}</span>
                        <span className="research-card-dot" aria-hidden="true">·</span>
                        <span className="research-card-date">{post.date}</span>
                      </div>
                      <h3 className="research-card-title">{post.title}</h3>
                      <p className="research-card-description">{post.excerpt}</p>
                      <span className="research-card-arrow" aria-hidden="true">
                        <span className="research-card-arrow-inner">→</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {totalSlides > 1 && (
            <div className="research-dots" role="tablist" aria-label="Slider dots">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  role="tab"
                  aria-selected={idx === currentSlide}
                  aria-label={`Go to slide ${idx + 1}`}
                  className={`research-dot${idx === currentSlide ? ' active' : ''}`}
                  onClick={() => goToSlide(idx)}
                />
              ))}
            </div>
          )}
        </div>
        )}

        <div className="research-cta-wrap">
          <Link to="/research" className="research-cta research_anim">
            View all research
          </Link>
        </div>
      </div>
    </section>
  );
};

export default ResearchSection;
