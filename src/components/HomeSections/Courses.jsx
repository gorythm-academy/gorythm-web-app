// Courses Section (landing) – Sticky left panel + masonry course cards from GET /api/courses/public.
// Images: admin-uploaded homepageImage, else static files under /images/courses/<slug>.*.

import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../../config/constants';
import { useCurrency } from '../../context/CurrencyContext';
import { getPriceDisplayParts } from '../../utils/currency';
import { courseUrlSegment } from '../../utils/courseLinks';
import { getCourseImageSrc } from '../../utils/courseImages';
import {
  CATEGORY_ORDER,
  DESKTOP_MASONRY_MQ,
  buildMasonryColumns,
  getCategorySortIndex,
  getDisplayOrder,
} from '../../utils/courseMasonry';
import SmartCourseImage from '../SmartCourseImage/SmartCourseImage';
import './Courses.scss';
import titleLineSvg from '../../assets/title-line.svg';

export { CATEGORY_ORDER };

const normalizeTitle = (t) => (t || '').toLowerCase().replace(/\s+/g, ' ').trim();
const courseLinkParam = (c) => courseUrlSegment(c);

// Aspect ratios for masonry cards (cycled)
const MASONRY_ASPECT_RATIOS = ['16 / 10', '4 / 5', '5 / 6', '1 / 1', '3 / 4', '5 / 6', '16 / 10', '16 / 10', '5 / 6', '3 / 4'];
const ASPECT_RATIO_BY_COURSE_TITLE = {
  'quran recitation with tajweed': '16 / 10',
  'nazrah with tajweed': '4 / 5',
};
const getAspectRatioForCourse = (title, index) =>
  ASPECT_RATIO_BY_COURSE_TITLE[normalizeTitle(title)] || MASONRY_ASPECT_RATIOS[index % MASONRY_ASPECT_RATIOS.length];

const formatLevel = (level) => {
  if (!level) return '';
  const s = String(level);
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

const CoursesSection = ({
  ctaTo = '/courses',
  ctaLabel = 'Explore Courses',
  showMeta = false,
  emptyStateMode = 'home',
}) => {
  const sectionRef = useRef(null);
  const [isInView, setIsInView] = useState(false);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [masonryColumnCount, setMasonryColumnCount] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(DESKTOP_MASONRY_MQ).matches ? 3 : 2
  );
  const { formatFromUsdWhole } = useCurrency();

  const fetchCourses = React.useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const url = `${API_BASE_URL}/api/courses/public`;
      const res = await fetch(url);
      if (!res.ok) {
        setFetchError(true);
        setCourses([]);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (!data.success || !Array.isArray(data.courses)) {
        setFetchError(true);
        setCourses([]);
        setLoading(false);
        return;
      }
      setCourses(data.courses);
    } catch (_) {
      setFetchError(true);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const apiCourses = courses
    .map((c, index) => {
      const priceParts = getPriceDisplayParts(c.price, formatFromUsdWhole);
      return {
      id: c._id,
      _id: c._id,
      slug: c.slug || c._id,
      title: c.title || '',
      category: c.category || '',
      description: c.description || '',
      homepageImage: c.homepageImage || '',
      priceDisplay: priceParts.amount,
      priceShowMonth: priceParts.showMonth,
      duration: c.duration || '',
      level: formatLevel(c.level),
      image: getCourseImageSrc(c),
      aspectRatio: getAspectRatioForCourse(c.title, index),
      displayOrder: c.displayOrder,
      masonryColumn: c.masonryColumn,
    };
    })
    .sort((a, b) =>
      getDisplayOrder(a) - getDisplayOrder(b) ||
      getCategorySortIndex(a.category) - getCategorySortIndex(b.category) ||
      (a.title || '').localeCompare(b.title || '')
    );

  const displayCourses = apiCourses;

  const masonryColumns = buildMasonryColumns(displayCourses, masonryColumnCount);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsInView(true); },
      { threshold: 0.05, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(DESKTOP_MASONRY_MQ);
    const sync = () => setMasonryColumnCount(mq.matches ? 3 : 2);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`courses-section scheme_dark${isInView ? ' courses-section-inview' : ''}`}
    >
      <div className="courses-section-inner">

        <div className="courses-section-left">
          <div className="courses-section-left-sticky">
            <div className="courses-section-left-content">
              <span className="courses-section-big-number" aria-hidden="true">01</span>
              <h2 className="courses-section-title courses-section_anim">
              COURSES THAT ENCOURAGE FULL-SPECTRUM DEVELOPMENT
              </h2>
              <img src={titleLineSvg} alt="" className="courses-section-title-line courses-section_anim" aria-hidden="true" />

              <div className="courses-section-left-footer">
                <p className="courses-section-description courses-section_anim">
                At Gorythm, every course is designed to build something that endures. Grounded in research, anchored in faith, structured for learners worldwide, and always oriented towards a purposeful vision.
                </p>
                <Link to={ctaTo} className="courses-section-cta courses-section_anim">
                  <span className="courses-section-cta-text">{ctaLabel}</span>
                  <span className="courses-section-cta-arrow" aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="courses-section-right native-scroll-zone">
          {loading ? (
            <div className="courses-section-loading">
              <p>Loading courses…</p>
            </div>
          ) : displayCourses.length === 0 ? (
            <div className="courses-section-empty">
              <p className="courses-section-empty-title">
                {fetchError ? 'Could not load courses' : 'No courses to show'}
              </p>
              <p className="courses-section-empty-desc">
                {fetchError
                  ? 'We couldn’t load courses right now. Please try again in a moment.'
                  : emptyStateMode === 'all-courses'
                    ? 'No courses are available at the moment. Please check back soon.'
                    : 'No courses are available at the moment. Please check back soon.'}
              </p>
              <button type="button" className="courses-section-empty-btn" onClick={fetchCourses}>
                Refresh
              </button>
            </div>
          ) : (
          <div className="courses-section-masonry">
            {masonryColumns.map((columnCourses, columnIndex) => (
              <div key={columnIndex} className="courses-section-column">
                {columnCourses.map((course) => (
                  <Link
                    key={course.id || course._id}
                    to={`/courses/${courseLinkParam(course)}`}
                    className="courses-section-item courses-section_anim"
                  >
                    <div
                      className="courses-section-item-img-wrap"
                      style={{ aspectRatio: course.aspectRatio }}
                    >
                      <SmartCourseImage
                        course={course}
                        alt={course.title}
                        loading="lazy"
                        width={400}
                        height={250}
                        sizes="(min-width: 1280px) 33vw, (min-width: 768px) 48vw, 100vw"
                      />
                    </div>
                    <div className="courses-section-item-caption">
                      <div className="courses-section-item-copy">
                        <h2 className="courses-section-item-title">{course.title}</h2>
                        {showMeta ? (
                          <div className="courses-section-item-meta">
                            <span className="courses-section-item-price">
                              <span className="courses-section-item-price-amount">{course.priceDisplay}</span>
                              {course.priceShowMonth ? (
                                <span className="courses-section-item-price-period">Monthly</span>
                              ) : null}
                            </span>
                            <span className="courses-section-item-duration">{course.duration}</span>
                            <span className="courses-section-item-audience">{course.level}</span>
                          </div>
                        ) : null}
                      </div>
                      <span className="courses-section-item-arrow" aria-hidden="true">→</span>
                    </div>
                  </Link>
                ))}
              </div>
            ))}
          </div>
          )}
        </div>

      </div>
    </section>
  );
};

export default CoursesSection;
