import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { API_BASE_URL, SITE_URL } from '../../config/constants';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useCurrency } from '../../context/CurrencyContext';
import { getPriceDisplayParts, parsePriceAmount } from '../../utils/currency';
import { courseUrlSegment } from '../../utils/courseLinks';
import { getCourseImageSrc } from '../../utils/courseImages';
import {
  DESKTOP_MASONRY_MQ,
  getCourseMasonryColumnIndex,
  sortCoursesForCatalog,
} from '../../utils/courseMasonry';
import { getAuthToken, AUTH_REALM } from '../../utils/authStorage';
import SmartCourseImage from '../SmartCourseImage/SmartCourseImage';
import './SingleCourse.scss';

const formatLevel = (level) => {
  if (!level) return '';
  const s = String(level);
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

const getPriceAmount = (price) => {
  const n = parsePriceAmount(price);
  return Number.isNaN(n) ? 0 : n;
};

export function SingleCourse() {
  const { currency, formatFromUsdWhole } = useCurrency();
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const isAdminPreview = searchParams.get('preview') === '1';
  const [apiCourse, setApiCourse] = useState(null);
  const [apiList, setApiList] = useState([]);
  const [loading, setLoading] = useState(() => !!slug);
  const [loadError, setLoadError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [masonryColumnCount, setMasonryColumnCount] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(DESKTOP_MASONRY_MQ).matches ? 3 : 2
  );
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
    setLoadError(false);
    setNotFound(false);

    const adminToken = isAdminPreview ? getAuthToken(AUTH_REALM.ADMIN) : null;
    const courseUrl =
      isAdminPreview && adminToken
        ? `${API_BASE_URL}/api/courses/preview/${slug}`
        : `${API_BASE_URL}/api/courses/${slug}`;
    const courseFetchOpts =
      isAdminPreview && adminToken
        ? { headers: { Authorization: `Bearer ${adminToken}` } }
        : undefined;

    fetch(courseUrl, courseFetchOpts)
      .then((r) => r.json())
      .then((one) => {
        if (cancelled) return;
        if (one.success && one.course) {
          setApiCourse(one.course);
        } else {
          setApiCourse(null);
          setNotFound(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setApiCourse(null);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    if (!isAdminPreview) {
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
    } else {
      setApiList([]);
    }

    return () => { cancelled = true; };
  }, [slug, isAdminPreview]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(DESKTOP_MASONRY_MQ);
    const sync = () => setMasonryColumnCount(mq.matches ? 3 : 2);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const previousDocumentTitle = documentTitleRef.current;
    return () => {
      const shareTimerId = shareFeedbackTimerRef.current;
      if (shareTimerId) clearTimeout(shareTimerId);
      if (previousDocumentTitle != null) document.title = previousDocumentTitle;
    };
  }, []);

  const courseMeta = useMemo(() => {
    if (!apiCourse?.title) return null;
    const base = SITE_URL.replace(/\/$/, '');
    const segment = apiCourse.slug || slug;
    return {
      title: `${apiCourse.title} | Courses | Gorythm Academy`,
      description: apiCourse.description || `${apiCourse.title} — Gorythm Academy course.`,
      image: getCourseImageSrc(apiCourse) || undefined,
      url: `${base}/courses/${segment}`,
    };
  }, [apiCourse, slug]);

  usePageMeta(courseMeta, { enabled: Boolean(courseMeta) });

  const course = useMemo(() => {
    if (!apiCourse) return null;
    const image = getCourseImageSrc(apiCourse);
    const priceParts = getPriceDisplayParts(apiCourse.price, formatFromUsdWhole);
    return {
      _id: apiCourse._id,
      slug: apiCourse.slug || apiCourse._id,
      title: apiCourse.title,
      homepageImage: apiCourse.homepageImage || '',
      overview: apiCourse.description,
      description: apiCourse.description,
      image,
      priceDisplay: priceParts.amount,
      priceShowMonth: priceParts.showMonth,
      priceAmount: getPriceAmount(apiCourse.price),
      level: formatLevel(apiCourse.level),
      duration: apiCourse.duration,
      category: apiCourse.category,
      isPublished: apiCourse.isPublished !== false,
    };
  }, [apiCourse, formatFromUsdWhole]);

  const sortedList = useMemo(() => sortCoursesForCatalog(apiList), [apiList]);

  const isRightColumn = useMemo(() => {
    if (!course?._id) return false;
    const col = getCourseMasonryColumnIndex(sortedList, course._id, masonryColumnCount);
    return col === masonryColumnCount - 1;
  }, [sortedList, course?._id, masonryColumnCount]);

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

  if (loadError) {
    return (
      <section className="course-item-page scheme_dark">
        <div className="cip-page-header">
          <p className="cip-page-title" role="alert">Could not load this course. Check your connection and try again.</p>
          <Link to="/courses" className="cip-page-back">← Back to courses</Link>
        </div>
      </section>
    );
  }

  if (notFound || !course) {
    return (
      <section className="course-item-page scheme_dark">
        <div className="cip-page-header">
          <p className="cip-page-title">Course not found</p>
          <Link to="/courses" className="cip-page-back">← Back to courses</Link>
        </div>
      </section>
    );
  }

  const currentIndex = sortedList.findIndex((c) => String(c._id) === String(course._id));
  const prevItem = currentIndex > 0 ? sortedList[currentIndex - 1] : null;
  const nextItem = currentIndex >= 0 && currentIndex < sortedList.length - 1 ? sortedList[currentIndex + 1] : null;
  const prevCourse = prevItem ? { slug: courseUrlSegment(prevItem), title: prevItem.title } : null;
  const nextCourse = nextItem ? { slug: courseUrlSegment(nextItem), title: nextItem.title } : null;
  const paymentPath = `/payment?courseId=${encodeURIComponent(course._id)}&displayCurrency=${encodeURIComponent(currency)}`;

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

  const renderSidebar = () => (
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
          {!isAdminPreview && (
            course.priceAmount > 0 ? (
              <Link to={paymentPath} className="cip-cta">
                Enroll Now
              </Link>
            ) : (
              <Link to="/contact" className="cip-cta">
                Contact us to enroll
              </Link>
            )
          )}
          <Link to="/courses" className="cip-back-link">
            <span>←</span> Back to All Courses
          </Link>
        </div>
      </div>
    </aside>
  );

  const renderMain = () => (
    <div ref={leftRef} className="cip-left">
      {course.image ? (
        <div className="cip-main-image">
          <SmartCourseImage
            course={course}
            alt={course.title}
            loading="lazy"
            width={1180}
            height={664}
            sizes="(min-width: 1200px) 1180px, 100vw"
          />
        </div>
      ) : null}
      <div className="cip-copy">
        <h2 className="cip-subtitle">Course overview</h2>
        {course.overview ? <p className="cip-text">{course.overview}</p> : null}
      </div>
    </div>
  );

  return (
    <section className="course-item-page scheme_dark">
      {isAdminPreview && !course.isPublished ? (
        <div className="cip-preview-banner" role="status">
          Admin draft preview — this course is not published on the public site.
        </div>
      ) : null}
      <div className="cip-page-header">
        <h1 className="cip-page-title">{course.title}</h1>
        <span className="cip-page-arrow" aria-hidden="true" />
      </div>

      <div ref={layoutRef} className={`cip-layout${isRightColumn ? ' cip-layout--flipped' : ''}`}>
        {isRightColumn ? (
          <>
            {renderSidebar()}
            {renderMain()}
          </>
        ) : (
          <>
            {renderMain()}
            {renderSidebar()}
          </>
        )}
      </div>

      {!isAdminPreview ? (
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
      ) : null}
    </section>
  );
}
