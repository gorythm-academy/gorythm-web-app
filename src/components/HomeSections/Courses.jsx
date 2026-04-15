// Courses Section (landing) – Sticky left panel (All Courses text) + right gallery (course cards)
//
// DATA: From course table via API (GET /api/courses/public). If API returns no courses, we show
//       the static list from AllCourses.jsx so the masonry is never empty.
//
// IMAGES: Fetched from two places only:
//   1. API courses: each course’s "Homepage card image" field (homepageImage) – set in Admin →
//      Course Management → Edit course → "Homepage card image (URL or path)". Can be a full URL
//      or a path from your public folder. If empty, we use an image from assets/images matched by
//      course title (e.g. "Quran Recitation with Tajweed.avif") or a fallback placeholder from assets.
//   2. Fallback list (static AllCourses): each item’s `image` property (hardcoded URLs in AllCourses.jsx).

import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../../config/constants';
import { useCurrency } from '../../context/CurrencyContext';
import { getPriceDisplayParts } from '../../utils/currency';
import { courseUrlSegment } from '../../utils/courseLinks';
// NOTE: Homepage courses are now API-only (no static fallback).
import './Courses.scss';
import titleLineSvg from '../../assets/title-line.svg';
// Course-named images from src/assets/images (matched by course title when no homepageImage is set)
import assetQuranRecitation from '../../assets/images/Quran Recitation with Tajweed.avif';
import assetNazrahTajweed from '../../assets/images/Nazrah with Tajweed.avif';
import assetIslamicStudiesKids from '../../assets/images/islamic studies for kids.png';
import assetEmotionalIntelligence from '../../assets/images/emotional intelligence.jpg';
import assetStemIslamic from '../../assets/images/stem with islamic integration.jpg';
import assetSummerCamps from '../../assets/images/summer camps for kids.jpg';
// Fallback placeholders when no title match
import assetPlaceholder1 from '../../assets/images/milestone-img01.jpg';
import assetPlaceholder2 from '../../assets/images/milestone-img02.jpg';
import assetPlaceholder3 from '../../assets/images/About-Sect-01.jpg';
import assetPlaceholder4 from '../../assets/images/About-Sect-02.jpg';

const ASSETS_BY_COURSE_TITLE = {
  'quran recitation with tajweed': assetQuranRecitation,
  'nazrah with tajweed': assetNazrahTajweed,
  'islamic studies for kids': assetIslamicStudiesKids,
  'emotional intelligence': assetEmotionalIntelligence,
  'stem with islamic integration': assetStemIslamic,
  'summer camps for kids': assetSummerCamps,
};
const PLACEHOLDER_IMAGES = [assetPlaceholder1, assetPlaceholder2, assetPlaceholder3, assetPlaceholder4];
const normalizeTitle = (t) => (t || '').toLowerCase().replace(/\s+/g, ' ').trim();
const courseLinkParam = (c) => courseUrlSegment(c);
export const getImageFromAssets = (title, index) =>
  ASSETS_BY_COURSE_TITLE[normalizeTitle(title)] || PLACEHOLDER_IMAGES[index % PLACEHOLDER_IMAGES.length];

// Aspect ratios for masonry cards (cycled)
const MASONRY_ASPECT_RATIOS = ['16 / 10', '4 / 5', '5 / 6', '1 / 1', '3 / 4', '5 / 6', '16 / 10', '16 / 10', '5 / 6', '3 / 4'];

// Category display order: Quran, Tajweed, Islamic Studies, Seerah, STEM, then the rest.
export const CATEGORY_ORDER = [
  'Quranic Arabic',
  'Tajweed',
  'Islamic Studies',
  'Seerah',
  'STEM',
  'Memorization (Hifz)',
  'Fiqh',
  'Hadith',
  'Aqeedah',
  'Other',
];
const getCategorySortIndex = (category) => {
  const i = CATEGORY_ORDER.indexOf(category || '');
  return i === -1 ? CATEGORY_ORDER.length : i;
};
const getDisplayOrder = (course) => {
  const order = Number(course?.displayOrder);
  return Number.isFinite(order) ? order : 9999;
};
const getMasonryColumn = (course) => {
  const col = Number(course?.masonryColumn);
  return [1, 2, 3].includes(col) ? col : null;
};
const buildMasonryColumns = (items) => {
  const columns = [[], [], []];
  let autoIndex = 0;
  items.forEach((course) => {
    const forcedCol = getMasonryColumn(course);
    if (forcedCol) {
      columns[forcedCol - 1].push(course);
      return;
    }
    columns[autoIndex % 3].push(course);
    autoIndex += 1;
  });
  return columns;
};

// Used by /portfolio and /portfolio/:slug pages (PortfolioPages.jsx)
export const portfolioItems = [
  { id: 1, slug: 'the-milky-way', title: 'The Milky Way', category: 'Deep Space', image: 'https://images.unsplash.com/photo-1462332420958-a05d1e002413?w=700&q=80', aspectRatio: '3/4', description: 'A sweeping view of our home galaxy.' },
  { id: 2, slug: 'astronaut-in-space', title: 'Astronaut in Space', category: 'Human Spaceflight', image: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?w=700&q=80', aspectRatio: '2/3', description: 'A lone astronaut floats above Earth.' },
  { id: 3, slug: 'space-collision', title: 'Space Collision', category: 'Phenomena', image: 'https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=700&q=80', aspectRatio: '4/3', description: 'Two galaxies locked in a slow gravitational dance.' },
  { id: 4, slug: 'space-shuttle', title: 'Space Shuttle', category: 'Engineering', image: 'https://images.unsplash.com/photo-1541873676-a18131494184?w=700&q=80', aspectRatio: '3/4', description: 'The iconic orbiter.' },
  { id: 5, slug: 'modern-satellites', title: 'Modern Satellites', category: 'Technology', image: 'https://images.unsplash.com/photo-1446776858070-70c3d5ed6758?w=700&q=80', aspectRatio: '1/1', description: 'A constellation of satellites.' },
  { id: 6, slug: 'the-universe', title: 'The Universe', category: 'Cosmology', image: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=700&q=80', aspectRatio: '4/5', description: 'An awe-inspiring glimpse into space-time.' },
];

const formatLevel = (level) => {
  if (!level) return '';
  const s = String(level);
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

const CoursesSection = () => {
  const sectionRef = useRef(null);
  const galleryRef = useRef(null);
  const [isInView, setIsInView] = useState(false);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
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
      priceDisplay: priceParts.amount,
      priceShowMonth: priceParts.showMonth,
      duration: c.duration || '',
      level: formatLevel(c.level),
      image: (c.homepageImage && c.homepageImage.trim()) ? c.homepageImage.trim() : getImageFromAssets(c.title, index),
      aspectRatio: MASONRY_ASPECT_RATIOS[index % MASONRY_ASPECT_RATIOS.length],
      displayOrder: c.displayOrder,
      masonryColumn: c.masonryColumn,
    };
    })
    .sort((a, b) =>
      getDisplayOrder(a) - getDisplayOrder(b) ||
      getCategorySortIndex(a.category) - getCategorySortIndex(b.category) ||
      (a.title || '').localeCompare(b.title || '')
    );

  // API-only display (no static fallback)
  const displayCourses = apiCourses;

  const masonryColumns = buildMasonryColumns(displayCourses);

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
                Learn Quran, Arabic, STEM, and Islamic studies in one place
              </h2>
              <img src={titleLineSvg} alt="" className="courses-section-title-line courses-section_anim" aria-hidden="true" />

              <div className="courses-section-left-footer">
                <p className="courses-section-description courses-section_anim">
                  Explore a range of courses designed to strengthen your connection with the Qur’an, build Islamic
                  knowledge, and develop essential life skills.
                </p>
                <Link to="/courses" className="courses-section-cta courses-section_anim">
                  <span className="courses-section-cta-text">Explore Courses</span>
                  <span className="courses-section-cta-arrow" aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div ref={galleryRef} className="courses-section-right native-scroll-zone">
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
                  ? `Backend may be off or unreachable at ${API_BASE_URL}. Start the backend (e.g. node server), then click Refresh.`
                  : 'The homepage only shows published courses. In Admin → Course Management, set each course’s status to “Published” (eye icon) to see them here.'}
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
                      <img src={course.image} alt={course.title} loading="lazy" width={400} height={250} sizes="(min-width: 993px) 50vw, 100vw" />
                    </div>
                    <div className="courses-section-item-caption">
                      <div className="courses-section-item-copy">
                        <h2 className="courses-section-item-title">{course.title}</h2>
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
