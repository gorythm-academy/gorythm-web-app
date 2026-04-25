import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { API_BASE_URL } from '../../config/constants';
import { useCurrency } from '../../context/CurrencyContext';
import { getPriceDisplayParts, parsePriceAmount } from '../../utils/currency';
import { courseUrlSegment } from '../../utils/courseLinks';
import { getCourseImageSrc, setImageFallbackToPlaceholder } from '../../utils/courseImages';
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

const formatLevel = (level) => {
  if (!level) return '';
  const s = String(level);
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

/** Numeric price for payment (handles raw number or formatted string like "$30/Month") */
const getPriceAmount = (price) => {
  const n = parsePriceAmount(price);
  return Number.isNaN(n) ? 0 : n;
};

export function SingleCourse() {
  const { currency, formatFromUsdWhole } = useCurrency();
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
  const [shareFeedback, setShareFeedback] = useState('');
  const shareFeedbackTimerRef = useRef(null);
  const documentTitleRef = useRef(typeof document !== 'undefined' ? document.title : '');

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    // Load primary course first for faster perceived page render.
    fetch(`${API_BASE_URL}/api/courses/${slug}`)
      .then((r) => r.json())
      .then((one) => {
        if (cancelled) return;
        if (one.success && one.course) {
          setApiCourse(one.course);
        } else {
          setApiCourse(null);
        }
      })
      .catch(() => {
        if (!cancelled) setApiCourse(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Fetch list in background for next/prev links and image index.
    fetch(`${API_BASE_URL}/api/courses/public`)
      .then((r) => r.json())
      .then((list) => {
        if (cancelled) return;
        if (list.success && Array.isArray(list.courses)) {
          setApiList(list.courses);
        } else {
          setApiList([]);
        }
      })
      .catch(() => {
        if (!cancelled) setApiList([]);
      });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    const previousDocumentTitle = documentTitleRef.current;
    return () => {
      const shareTimerId = shareFeedbackTimerRef.current;
      if (shareTimerId) clearTimeout(shareTimerId);
      if (previousDocumentTitle != null) document.title = previousDocumentTitle;
    };
  }, []);

  useEffect(() => {
    if (!apiCourse?.title) return;
    document.title = `${apiCourse.title} | Courses`;
  }, [apiCourse?.title]);

  const course = useMemo(() => {
    if (!apiCourse) return null;
    const image = getCourseImageSrc(apiCourse);
    const priceParts = getPriceDisplayParts(apiCourse.price, formatFromUsdWhole);
    return {
      _id: apiCourse._id,
      slug: apiCourse.slug || apiCourse._id,
      title: apiCourse.title,
      overview: apiCourse.description,
      description: apiCourse.description,
      image,
      galleryImages: [],
      priceDisplay: priceParts.amount,
      priceShowMonth: priceParts.showMonth,
      priceAmount: getPriceAmount(apiCourse.price),
      level: formatLevel(apiCourse.level),
      duration: apiCourse.duration,
      category: apiCourse.category,
    };
  }, [apiCourse, apiList, formatFromUsdWhole]);

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
  const currentIndex = list.findIndex((c) => String(c._id) === String(course._id));
  const isRightColumn = currentIndex >= 0 && currentIndex % 2 === 1; // match masonry: left=even, right=odd
  const prevItem = currentIndex > 0 ? list[currentIndex - 1] : null;
  const nextItem = currentIndex >= 0 && currentIndex < list.length - 1 ? list[currentIndex + 1] : null;
  const prevCourse = prevItem ? { slug: courseUrlSegment(prevItem), title: prevItem.title } : null;
  const nextCourse = nextItem ? { slug: courseUrlSegment(nextItem), title: nextItem.title } : null;

  const handleShareCourse = async () => {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}${window.location.search}`
        : '';
    if (!url) return;
    const title = course.title || 'Course';
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      if (shareFeedbackTimerRef.current) clearTimeout(shareFeedbackTimerRef.current);
      setShareFeedback('Link copied');
      shareFeedbackTimerRef.current = setTimeout(() => {
        setShareFeedback('');
        shareFeedbackTimerRef.current = null;
      }, 2500);
    } catch {
      if (shareFeedbackTimerRef.current) clearTimeout(shareFeedbackTimerRef.current);
      setShareFeedback('Could not copy');
      shareFeedbackTimerRef.current = setTimeout(() => {
        setShareFeedback('');
        shareFeedbackTimerRef.current = null;
      }, 2500);
    }
  };

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
                    <span className="cip-meta-value cip-meta-value--price">
                      <span className="cip-meta-price-amount">{course.priceDisplay}</span>
                      {course.priceShowMonth ? (
                        <span className="cip-meta-price-period">Monthly</span>
                      ) : null}
                    </span>
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
                  <button
                    type="button"
                    className="cip-share-btn cip-share-btn--sidebar"
                    onClick={handleShareCourse}
                    aria-label="Share link to this course"
                  >
                    <i className="fa-solid fa-share-nodes" aria-hidden="true" />
                    <span>Share Course</span>
                  </button>
                  {shareFeedback ? (
                    <p className="cip-share-feedback" role="status">
                      {shareFeedback}
                    </p>
                  ) : null}
                  <Link
                    to={`/payment?courseName=${encodeURIComponent(course.title)}&amount=${course.priceAmount}&displayCurrency=${encodeURIComponent(currency)}`}
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
                  <img
                    src={course.image}
                    alt={course.title}
                    loading="lazy"
                    width={1180}
                    height={664}
                    sizes="(min-width: 1200px) 1180px, 100vw"
                    onError={setImageFallbackToPlaceholder}
                  />
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
                  <img
                    src={course.image}
                    alt={course.title}
                    loading="lazy"
                    width={1180}
                    height={664}
                    sizes="(min-width: 1200px) 1180px, 100vw"
                    onError={setImageFallbackToPlaceholder}
                  />
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
                <span className="cip-meta-value cip-meta-value--price">
                  <span className="cip-meta-price-amount">{course.priceDisplay}</span>
                  {course.priceShowMonth ? (
                    <span className="cip-meta-price-period">Monthly</span>
                  ) : null}
                </span>
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
              <button
                type="button"
                className="cip-share-btn cip-share-btn--sidebar"
                onClick={handleShareCourse}
                aria-label="Share link to this course"
              >
                <i className="fa-solid fa-share-nodes" aria-hidden="true" />
                <span>Share Course</span>
              </button>
              {shareFeedback ? (
                <p className="cip-share-feedback" role="status">
                  {shareFeedback}
                </p>
              ) : null}
              <Link
                to={`/payment?courseName=${encodeURIComponent(course.title)}&amount=${course.priceAmount}&displayCurrency=${encodeURIComponent(currency)}`}
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
