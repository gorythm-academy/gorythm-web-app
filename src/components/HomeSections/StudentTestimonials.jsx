import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './StudentTestimonials.scss';
import testimonialImg1 from '../../assets/images/milestone-img01.jpg';
import testimonialImg2 from '../../assets/images/milestone-img02.jpg';
import testimonialImg3 from '../../assets/images/emotional intelligence.jpg';

const testimonials = [
  {
    name: 'Andrew Lewis',
    role: 'Engineer',
    image: testimonialImg1,
    quote:
      'Beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed. Beatae vitae dicta. Adipisciing elit, sed do eiusmod tempor incididunt.',
  },
  {
    name: 'Sana Noor',
    role: 'Medical Student',
    image: testimonialImg2,
    quote:
      'Learning here changed how I approach both academics and character. The sessions are practical, calm, and deeply motivating for long-term growth.',
  },
  {
    name: 'Ibrahim Khan',
    role: 'Software Student',
    image: testimonialImg3,
    quote:
      'The teachers explain difficult topics with patience. I gained confidence, better discipline, and a clear direction in my studies and daily routine.',
  },
];

const StudentTestimonialsSection = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [slideDir, setSlideDir] = useState(null);
  const [isInView, setIsInView] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [cursorDot, setCursorDot] = useState({ x: 0, y: 0, visible: false });
  const navLockRef = useRef(false);
  const sectionRef = useRef(null);
  const dragActiveRef = useRef(false);
  const dragTriggerXRef = useRef(0);
  const dragThreshold = 68;
  const touchActiveRef = useRef(false);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const touchAxisLockedRef = useRef(null); // 'x' | 'y' | null

  const count = testimonials.length;

  const prevIndex = useMemo(() => (activeIndex - 1 + count) % count, [activeIndex, count]);
  const nextIndex = useMemo(() => (activeIndex + 1) % count, [activeIndex, count]);

  const animateStep = useCallback(
    (dir) => {
      if (navLockRef.current) return;
      navLockRef.current = true;
      setSlideDir(dir);
      setIsAnimating(true);
      setActiveIndex((prev) =>
        dir === 'next' ? (prev + 1) % count : (prev - 1 + count) % count,
      );
      setTimeout(() => {
        setIsAnimating(false);
        navLockRef.current = false;
      }, 500);
    },
    [count],
  );

  const goPrev = useCallback(() => animateStep('prev'), [animateStep]);
  const goNext = useCallback(() => animateStep('next'), [animateStep]);

  const onSectionMouseDown = (e) => {
    if (e.button !== 0) return;
    if (typeof window !== 'undefined' && !window.matchMedia('(pointer: fine)').matches) return;
    dragActiveRef.current = true;
    dragTriggerXRef.current = e.clientX;
    setIsDragging(true);
    e.preventDefault();
  };

  const onTouchStart = (e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    touchActiveRef.current = true;
    touchAxisLockedRef.current = null;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchMove = (e) => {
    if (!touchActiveRef.current) return;
    const t = e.touches && e.touches[0];
    if (!t) return;

    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;

    // Decide whether user intends horizontal swipe vs vertical scroll.
    if (!touchAxisLockedRef.current) {
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX < 8 && absY < 8) return;
      touchAxisLockedRef.current = absX > absY ? 'x' : 'y';
    }

    // Only intercept when the intent is horizontal swipe.
    if (touchAxisLockedRef.current !== 'x') return;

    if (Math.abs(dx) < dragThreshold) return;

    // Prevent the browser from also panning horizontally.
    e.preventDefault();

    if (dx > 0) goPrev();
    else goNext();

    // Reset baseline so the user can swipe multiple steps.
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    touchAxisLockedRef.current = null;
  };

  const onTouchEnd = () => {
    touchActiveRef.current = false;
    touchAxisLockedRef.current = null;
  };

  const onSectionMouseMove = (e) => {
    if (typeof window !== 'undefined' && !window.matchMedia('(pointer: fine)').matches) return;
    const sectionEl = sectionRef.current;
    if (!sectionEl) return;
    const rect = sectionEl.getBoundingClientRect();
    setCursorDot({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      visible: true,
    });
  };

  const onSectionMouseEnter = (e) => {
    onSectionMouseMove(e);
  };

  const onSectionMouseLeave = () => {
    setCursorDot((prev) => ({ ...prev, visible: false }));
    dragActiveRef.current = false;
    setIsDragging(false);
  };

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragActiveRef.current) return;
      const delta = e.clientX - dragTriggerXRef.current;
      if (Math.abs(delta) < dragThreshold) return;
      if (delta > 0) goPrev();
      else goNext();
      dragTriggerXRef.current = e.clientX;
    };

    const stopDrag = () => {
      if (!dragActiveRef.current) return;
      dragActiveRef.current = false;
      setIsDragging(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', stopDrag);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', stopDrag);
    };
  }, [goNext, goPrev]);

  useEffect(() => {
    if (!slideDir) return undefined;
    const t = setTimeout(() => setSlideDir(null), 520);
    return () => clearTimeout(t);
  }, [slideDir]);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsInView(true);
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`student-testimonials-section scheme_dark${isInView ? ' student-testimonials-inview' : ''}${isDragging ? ' student-testimonials-section--dragging' : ''}`}
      aria-label="Student testimonials"
      aria-roledescription="carousel"
      onMouseDown={onSectionMouseDown}
      onMouseMove={onSectionMouseMove}
      onMouseEnter={onSectionMouseEnter}
      onMouseLeave={onSectionMouseLeave}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div className="student-testimonials-rule-wrap" aria-hidden="true">
        <hr className="student-testimonials-rule" />
      </div>

      {cursorDot.visible ? (
        <span
          className="student-testimonials-cursor-dot"
          style={{ left: `${cursorDot.x}px`, top: `${cursorDot.y}px` }}
          aria-hidden="true"
        />
      ) : null}

      <button
        type="button"
        className="student-testimonials-side-arrow student-testimonials-side-arrow--left"
        onClick={goPrev}
        aria-label="Previous testimonial"
      >
        <span aria-hidden="true">←</span>
      </button>

      <button
        type="button"
        className="student-testimonials-side-arrow student-testimonials-side-arrow--right"
        onClick={goNext}
        aria-label="Next testimonial"
      >
        <span aria-hidden="true">→</span>
      </button>

      <div className="student-testimonials-content">
        <h3 className="student-testimonials-heading">Student Testimonials</h3>
        <div className="student-testimonials-quote-mark" aria-hidden="true">
          ”
        </div>

        <div className="student-testimonials-quote-wrap">
          <p
            className={`student-testimonials-quote${isAnimating ? ' student-testimonials-quote--animating' : ''}${slideDir === 'next' ? ' student-testimonials-quote--slide-next' : ''}${slideDir === 'prev' ? ' student-testimonials-quote--slide-prev' : ''}`}
            aria-live="polite"
          >
            {testimonials[activeIndex].quote}
          </p>
        </div>

        <div
          className={`student-testimonials-author${slideDir === 'next' ? ' student-testimonials-author--slide-next' : ''}${slideDir === 'prev' ? ' student-testimonials-author--slide-prev' : ''}`}
        >
          <strong>{testimonials[activeIndex].name}</strong>
          <span>{testimonials[activeIndex].role}</span>
        </div>

        <div className="student-testimonials-avatars" role="group" aria-label="Testimonial authors">
          {[
            { idx: prevIndex, pos: 'prev' },
            { idx: activeIndex, pos: 'active' },
            { idx: nextIndex, pos: 'next' },
          ].map(({ idx, pos }) => {
            const item = testimonials[idx];
            const isActive = pos === 'active';
            return (
              <button
                key={`${pos}-${idx}-${activeIndex}`}
                type="button"
                className={`student-testimonials-avatar${isActive ? ' student-testimonials-avatar--active' : ''}`}
                onClick={() => {
                  if (pos === 'prev') goPrev();
                  if (pos === 'next') goNext();
                }}
                disabled={isActive}
                aria-label={isActive ? `${item.name} current` : item.name}
              >
                <img src={item.image} alt="" width={72} height={72} loading="lazy" />
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="student-testimonials-rule-wrap student-testimonials-rule-wrap--bottom"
        aria-hidden="true"
      >
        <hr className="student-testimonials-rule" />
      </div>
    </section>
  );
};

export default StudentTestimonialsSection;
