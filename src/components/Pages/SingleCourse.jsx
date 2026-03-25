import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getImageFromAssets } from '../HomeSections/Courses';
import { API_BASE_URL } from '../../config/constants';
import './SingleCourse.scss';

const renderGallery = (images) => {
  if (!images?.length) return null;
  const [first, second, third] = images;
  return (
    <div className="cip-gallery">
      <div className="cip-gallery-top">
        <div className="cip-gallery-card">
          <img src={first} alt="" loading="lazy" aria-hidden="true" width={400} height={400} />
        </div>
        <div className="cip-gallery-card">
          <img src={second} alt="" loading="lazy" aria-hidden="true" width={400} height={400} />
        </div>
      </div>
      <div className="cip-gallery-card cip-gallery-card-wide">
        <img src={third} alt="" loading="lazy" aria-hidden="true" width={800} height={450} />
      </div>
    </div>
  );
};

const formatPrice = (price) => {
  if (price == null || price === '') return '';
  const n = Number(price);
  if (Number.isNaN(n)) return String(price);
  return n === 0 ? 'Free' : `$${n}/Month`;
};

const formatLevel = (level) => {
  if (!level) return '';
  const s = String(level);
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

/** Numeric price for payment (handles raw number or formatted string like "$30/Month") */
const getPriceAmount = (price) => {
  if (price == null || price === '') return 0;
  const n = Number(price);
  if (!Number.isNaN(n)) return n;
  const match = String(price).match(/[\d.]+/);
  return match ? parseFloat(match[0], 10) : 0;
};

export function SingleCourse() {
  const { slug } = useParams();
  const [apiCourse, setApiCourse] = useState(null);
  const [apiList, setApiList] = useState([]);
  const [loading, setLoading] = useState(() => !!slug);
  const layoutRef = useRef(null);
  const leftRef = useRef(null);
  const asideRef = useRef(null);
  const stickyRef = useRef(null);
  const naturalHeightRef = useRef(0);
  const [stickyState, setStickyState] = useState({ mode: 'static', width: null, left: null });

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE_URL}/api/courses/${slug}`).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/courses/public`).then((r) => r.json()),
    ])
      .then(([one, list]) => {
        if (cancelled) return;
        if (one.success && one.course) {
          setApiCourse(one.course);
        } else {
          setApiCourse(null);
        }
        if (list.success && Array.isArray(list.courses)) {
          setApiList(list.courses);
        } else {
          setApiList([]);
        }
      })
      .catch(() => {
        if (!cancelled) setApiCourse(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [slug]);

  const course = useMemo(() => {
    if (!apiCourse) return null;
    const idx = apiList.findIndex((c) => c._id === apiCourse._id);
    const imageIndex = idx >= 0 ? idx : 0;
    const image =
      apiCourse.homepageImage && apiCourse.homepageImage.trim()
        ? apiCourse.homepageImage.trim()
        : getImageFromAssets(apiCourse.title, imageIndex);
    return {
      _id: apiCourse._id,
      slug: apiCourse.slug || apiCourse._id,
      title: apiCourse.title,
      overview: apiCourse.description,
      description: apiCourse.description,
      image,
      galleryImages: [],
      price: formatPrice(apiCourse.price),
      priceAmount: getPriceAmount(apiCourse.price),
      level: formatLevel(apiCourse.level),
      duration: apiCourse.duration,
      category: apiCourse.category,
    };
  }, [apiCourse, apiList]);

  useEffect(() => {
    if (stickyRef.current) {
      naturalHeightRef.current = stickyRef.current.offsetHeight;
    }
  }, [course, slug]);

  useEffect(() => {
    const topOffset = 132;
    const updateSticky = () => {
      const setIfChanged = (next) => {
        setStickyState((prev) =>
          prev.mode === next.mode && prev.width === next.width && prev.left === next.left
            ? prev
            : next
        );
      };
      if (
        typeof window === 'undefined' ||
        !course ||
        !layoutRef.current ||
        !asideRef.current ||
        !stickyRef.current ||
        window.innerWidth <= 992
      ) {
        setIfChanged({ mode: 'static', width: null, left: null });
        return;
      }
      const layoutRect = layoutRef.current.getBoundingClientRect();
      const boundaryRect = (leftRef.current || layoutRef.current).getBoundingClientRect();
      const asideRect = asideRef.current.getBoundingClientRect();
      const stickyHeight = naturalHeightRef.current || stickyRef.current.offsetHeight;
      const scrollTop = window.scrollY;
      const layoutTop = layoutRect.top + scrollTop;
      const layoutBottom = boundaryRect.bottom + scrollTop;
      const startStickAt = layoutTop - topOffset;
      const stopStickAt = layoutBottom - stickyHeight - topOffset;
      const hysteresis = 8;
      if (scrollTop <= startStickAt + hysteresis || stopStickAt <= startStickAt) {
        setIfChanged({ mode: 'static', width: null, left: null });
        return;
      }
      if (scrollTop >= stopStickAt - hysteresis) {
        setIfChanged({ mode: 'bottom', width: asideRect.width, left: null });
        return;
      }
      setIfChanged({ mode: 'fixed', width: asideRect.width, left: asideRect.left });
    };
    updateSticky();
    window.addEventListener('scroll', updateSticky, { passive: true });
    window.addEventListener('resize', updateSticky);
    return () => {
      window.removeEventListener('scroll', updateSticky);
      window.removeEventListener('resize', updateSticky);
    };
  }, [course, slug]);

  if (loading) {
    return (
      <section className="course-item-page scheme_dark">
        <div className="cip-page-header">
          <p className="cip-page-title">Loading…</p>
        </div>
      </section>
    );
  }

  if (!course) return <Navigate to="/courses" replace />;

  const list = apiList;
  const resolveLinkParam = (c) => (c && (c._id || c.slug || c.id)) || '';
  const currentIndex = list.findIndex((c) => resolveLinkParam(c) === (course._id || course.slug || course.id));
  const isRightColumn = currentIndex >= 0 && currentIndex % 2 === 1; // match masonry: left=even, right=odd
  const prevItem = currentIndex > 0 ? list[currentIndex - 1] : null;
  const nextItem = currentIndex >= 0 && currentIndex < list.length - 1 ? list[currentIndex + 1] : null;
  const prevCourse = prevItem ? { slug: resolveLinkParam(prevItem), title: prevItem.title } : null;
  const nextCourse = nextItem ? { slug: resolveLinkParam(nextItem), title: nextItem.title } : null;

  const stickyStyle =
    stickyState.mode === 'fixed' && stickyState.width != null
      ? { width: `${stickyState.width}px`, left: `${stickyState.left}px` }
      : stickyState.mode === 'bottom' && stickyState.width != null
        ? { width: `${stickyState.width}px` }
        : undefined;

  const asideStyle =
    stickyState.mode !== 'static' && naturalHeightRef.current
      ? { minHeight: naturalHeightRef.current }
      : undefined;

  return (
    <section className="course-item-page scheme_dark">
      <div className="cip-page-header">
        <h1 className="cip-page-title">{course.title}</h1>
        <span className="cip-page-arrow" aria-hidden="true" />
      </div>

      <div ref={layoutRef} className={`cip-layout${isRightColumn ? ' cip-layout--flipped' : ''}`}>
        {isRightColumn ? (
          <>
            <aside ref={asideRef} className="cip-right" style={asideStyle}>
              <div
                ref={stickyRef}
                className={`cip-right-sticky cip-right-sticky--${stickyState.mode}`}
                style={stickyStyle}
              >
                <div className="cip-meta">
                  <div className="cip-meta-row">
                    <span className="cip-meta-label">Price</span>
                    <span className="cip-meta-value">{course.price}</span>
                  </div>
                  <div className="cip-meta-row">
                    <span className="cip-meta-label">Level</span>
                    <span className="cip-meta-value">{course.level}</span>
                  </div>
                  <div className="cip-meta-row">
                    <span className="cip-meta-label">Weeks</span>
                    <span className="cip-meta-value">{course.duration}</span>
                  </div>
                  <div className="cip-meta-row">
                    <span className="cip-meta-label">Category</span>
                    <span className="cip-meta-value">{course.category}</span>
                  </div>
                </div>
                <div className="cip-actions">
                  <Link
                    to={`/payment?courseName=${encodeURIComponent(course.title)}&amount=${course.priceAmount ?? getPriceAmount(course.price)}`}
                    className="cip-cta"
                  >
                    Enroll Now
                  </Link>
                  <Link to="/courses" className="cip-back-link">
                    <span>←</span> Back to All Courses
                  </Link>
                </div>
              </div>
            </aside>
            <div ref={leftRef} className="cip-left">
              {course.image ? (
                <div className="cip-main-image">
                  <img src={course.image} alt={course.title} loading="lazy" width={1180} height={664} sizes="(min-width: 1200px) 1180px, 100vw" />
                </div>
              ) : null}
              <div className="cip-copy">
                <h2 className="cip-subtitle">Course overview</h2>
                {course.overview ? <p className="cip-text">{course.overview}</p> : null}
                <p className="cip-text">{course.description}</p>
              </div>
              {renderGallery(course.galleryImages)}
            </div>
          </>
        ) : (
          <>
            <div ref={leftRef} className="cip-left">
              {course.image ? (
                <div className="cip-main-image">
                  <img src={course.image} alt={course.title} loading="lazy" width={1180} height={664} sizes="(min-width: 1200px) 1180px, 100vw" />
                </div>
              ) : null}
              <div className="cip-copy">
                <h2 className="cip-subtitle">Course overview</h2>
                {course.overview ? <p className="cip-text">{course.overview}</p> : null}
                <p className="cip-text">{course.description}</p>
              </div>
              {renderGallery(course.galleryImages)}
            </div>
            <aside ref={asideRef} className="cip-right" style={asideStyle}>
          <div
            ref={stickyRef}
            className={`cip-right-sticky cip-right-sticky--${stickyState.mode}`}
            style={stickyStyle}
          >
            <div className="cip-meta">
              <div className="cip-meta-row">
                <span className="cip-meta-label">Price</span>
                <span className="cip-meta-value">{course.price}</span>
              </div>
              <div className="cip-meta-row">
                <span className="cip-meta-label">Level</span>
                <span className="cip-meta-value">{course.level}</span>
              </div>
              <div className="cip-meta-row">
                <span className="cip-meta-label">Weeks</span>
                <span className="cip-meta-value">{course.duration}</span>
              </div>
              <div className="cip-meta-row">
                <span className="cip-meta-label">Category</span>
                <span className="cip-meta-value">{course.category}</span>
              </div>
            </div>
            <div className="cip-actions">
              <Link
                to={`/payment?courseName=${encodeURIComponent(course.title)}&amount=${course.priceAmount ?? getPriceAmount(course.price)}`}
                className="cip-cta"
              >
                Enroll Now
              </Link>
              <Link to="/courses" className="cip-back-link">
                <span>←</span> Back to All Courses
              </Link>
            </div>
          </div>
        </aside>
          </>
        )}
      </div>

      <nav className="cip-nav">
        {prevCourse ? (
          <Link to={`/courses/${prevCourse.slug}`} className="cip-nav-link cip-nav-prev" replace={false}>
            <span className="cip-nav-arrow">←</span>
            <span className="cip-nav-label">{prevCourse.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {nextCourse ? (
          <Link to={`/courses/${nextCourse.slug}`} className="cip-nav-link cip-nav-next" replace={false}>
            <span className="cip-nav-label">{nextCourse.title}</span>
            <span className="cip-nav-arrow">→</span>
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </section>
  );
}
