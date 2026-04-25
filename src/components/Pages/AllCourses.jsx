import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../../config/constants';
import { useCurrency } from '../../context/CurrencyContext';
import { getPriceDisplayParts } from '../../utils/currency';
import { courseUrlSegment } from '../../utils/courseLinks';
import { getCourseImageSrc, setImageFallbackToPlaceholder } from '../../utils/courseImages';
import './AllCourses.scss';
import titleLineSvg from '../../assets/title-line.svg';
import assetPlaceholder1 from '../../assets/images/milestone-img01.jpg';
import assetPlaceholder2 from '../../assets/images/milestone-img02.jpg';
import assetPlaceholder3 from '../../assets/images/About-Sect-01.jpg';
import assetPlaceholder4 from '../../assets/images/About-Sect-02.jpg';

const DESKTOP_SCROLL_ZONE_MQ = '(min-width: 993px)';

const PLACEHOLDER_IMAGES = [assetPlaceholder1, assetPlaceholder2, assetPlaceholder3, assetPlaceholder4];
const MASONRY_ASPECT_RATIOS = ['16 / 10', '4 / 5', '5 / 6', '1 / 1', '3 / 4', '5 / 6', '16 / 10', '16 / 10', '5 / 6', '3 / 4'];
const ASPECT_RATIO_BY_COURSE_TITLE = {
  'quran recitation with tajweed': '16 / 10',
  'nazrah with tajweed': '4 / 5',
};
const CATEGORY_ORDER = ['Quranic Arabic', 'Tajweed', 'Islamic Studies', 'Seerah', 'STEM', 'Memorization (Hifz)', 'Fiqh', 'Hadith', 'Aqeedah', 'Other'];

const normalizeTitle = (t) => (t || '').toLowerCase().replace(/\s+/g, ' ').trim();
const getImageFromAssets = (_title, index) => PLACEHOLDER_IMAGES[index % PLACEHOLDER_IMAGES.length];
const getAspectRatioForCourse = (title, index) =>
  ASPECT_RATIO_BY_COURSE_TITLE[normalizeTitle(title)] || MASONRY_ASPECT_RATIOS[index % MASONRY_ASPECT_RATIOS.length];
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

// Return only the first "line" of a paragraph-like string:
// - Prefer splitting on explicit line breaks
// - Fallback to first sentence-ending punctuation
// - Otherwise return the whole string
const getFirstLine = (text) => {
  if (!text) return '';
  const raw = String(text).trim();
  const newlineIndex = raw.indexOf('\n');
  if (newlineIndex !== -1) {
    return raw.slice(0, newlineIndex).trim();
  }
  const match = raw.match(/(.+?[.!?])(\s|$)/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return raw;
};
const formatLevel = (level) => {
  if (!level) return '';
  const s = String(level);
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

const faqs = [
  {
    question: 'Who can enroll in GoRythm courses?',
    answer:
      'Our courses are designed for kids, teens, and adults of all levels. Whether you are a beginner or looking to improve your existing knowledge, we have structured programs to suit your needs.',
  },
  {
    question: 'Are the classes conducted online or in-person?',
    answer:
      'All our classes are conducted online, allowing learners to study from anywhere in the world with flexible scheduling and convenience.',
  },
  {
    question: 'Do I need prior knowledge to join a course?',
    answer:
      'No prior knowledge is required for most of our courses. We offer beginner-friendly options as well as advanced levels to ensure every learner can start comfortably.',
  },
  {
    question: 'How are the classes structured?',
    answer:
      'Classes are interactive and guided by qualified teachers. We focus on step-by-step learning, regular practice, and personalized feedback to ensure steady progress.',
  },
  {
    question: 'How can I enroll in a course?',
    answer:
      'You can enroll by contacting our team through Whatsapp or filling out the registration form. Our team will guide you through course selection, scheduling, and the onboarding process.',
  },
];

export const courses = [
  {
    id: 1,
    slug: 'quran-recitation-with-tajweed',
    title: 'Quran Recitation with Tajweed',
    category: 'Recitation',
    image:
      'https://images.unsplash.com/photo-1585036156171-384164a8c675?auto=format&fit=crop&w=900&q=80',
    aspectRatio: '16 / 10',
    description:
      'Improve your Quran recitation through guided tajweed learning.',
    overview:
      'A guided course that helps learners improve pronunciation, fluency, and confidence in Quran recitation with a clear tajweed-focused path.',
    galleryImages: [
      'https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1609599006353-e629aaabfeae?auto=format&fit=crop&w=900&q=80',
    ],
    price: '$30/Month',
    duration: '14 weeks',
    level: 'Beginner',
  },
  {
    id: 2,
    slug: 'nazrah-with-tajweed',
    title: 'Nazrah with Tajweed',
    category: 'Recitation',
    image:
      'https://images.unsplash.com/photo-1609599006353-e629aaabfeae?auto=format&fit=crop&w=900&q=80',
    aspectRatio: '4 / 5',
    description:
      "Master Qur'anic recitation with expert guidance and interactive lessons.",
    overview:
      "This nazrah pathway supports learners through structured Qur'anic reading, tajweed reinforcement, and self-paced consistency.",
    galleryImages: [
      'https://images.unsplash.com/photo-1585036156171-384164a8c675?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1491841550275-ad7854e35ca6?auto=format&fit=crop&w=900&q=80',
    ],
    price: '$28/Month',
    duration: 'Self Paced',
    level: 'All Levels',
  },
  {
    id: 3,
    slug: 'islamic-studies-for-kids',
    title: 'Islamic Studies for Kids',
    category: 'Kids',
    image:
      'https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&w=900&q=80',
    aspectRatio: '5 / 6',
    description:
      'Build a strong foundation of faith for children in a fun and engaging way.',
    overview:
      'A child-friendly Islamic studies course that introduces faith, values, and identity through simple, engaging, age-appropriate lessons.',
    galleryImages: [
      'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=900&q=80',
    ],
    price: '$15/Month',
    duration: '12 weeks',
    level: 'Beginner',
  },
  {
    id: 4,
    slug: 'quranic-arabic-course',
    title: 'Quranic Arabic Course',
    category: 'Arabic',
    image:
      'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=900&q=80',
    aspectRatio: '1 / 1',
    description:
      'Learn Quran with Arabic through a structured course for foundational understanding.',
    overview:
      'Based on the Al Farhan Academy focus, this course helps learners move from reading Arabic toward understanding Quranic words and structure.',
    galleryImages: [
      'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1519817650390-64a93db511aa?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1516541196182-6bdb0516ed27?auto=format&fit=crop&w=900&q=80',
    ],
    price: '$28/Month',
    duration: '6 months per level',
    level: 'Basic & Advanced',
  },
  {
    id: 5,
    slug: 'islamic-studies',
    title: 'Islamic Studies',
    category: 'Core Studies',
    image:
      'https://images.unsplash.com/photo-1491841550275-ad7854e35ca6?auto=format&fit=crop&w=900&q=80',
    aspectRatio: '3 / 4',
    description:
      'Comprehensive understanding of Islamic teachings for everyday life.',
    overview:
      'A wider Islamic studies track covering stories of the Prophets, Seerah, values from Quran and Hadith, and practical Islamic understanding.',
    galleryImages: [
      'https://images.unsplash.com/photo-1491841550275-ad7854e35ca6?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1519817650390-64a93db511aa?auto=format&fit=crop&w=900&q=80',
    ],
    price: '$28/Month',
    duration: '18 weeks',
    level: 'All Ages',
  },
  {
    id: 6,
    slug: 'emotional-intelligence',
    title: 'Emotional Intelligence',
    category: 'Character',
    image:
      'https://images.unsplash.com/photo-1499209974431-9dddcece7f88?auto=format&fit=crop&w=900&q=80',
    aspectRatio: '5 / 6',
    description:
      'Nurturing hearts with Islamic wisdom and practical emotional growth.',
    overview:
      'A character-building course that explores emotional awareness, healthy expression, and inner discipline through an Islamic lens.',
    galleryImages: [
      'https://images.unsplash.com/photo-1499209974431-9dddcece7f88?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=900&q=80',
    ],
    price: '$50/Month',
    duration: '16 weeks',
    level: 'All Ages',
  },
  {
    id: 7,
    slug: 'summer-camp-for-kids',
    title: 'Summer Camp for Kids',
    category: 'Seasonal',
    image:
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
    aspectRatio: '16 / 10',
    description: 'A themed summer learning journey designed especially for kids.',
    overview:
      'A short-format kids program blending faith, fun, activity, and memorable weekly themes into a summer learning experience.',
    galleryImages: [
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&w=900&q=80',
    ],
    price: '$50/Month',
    duration: '5 weeks per level',
    level: 'All Ages',
  },
  {
    id: 8,
    slug: 'critical-thinking',
    title: 'Critical Thinking',
    category: 'Logic',
    image:
      'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=80',
    aspectRatio: '16 / 10',
    description: 'Developing minds through faith and logic.',
    overview:
      'This course develops thoughtful reasoning, questioning, and reflection skills while staying grounded in faith and purpose.',
    galleryImages: [
      'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1499209974431-9dddcece7f88?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=900&q=80',
    ],
    price: '$50/Month',
    duration: '8 weeks',
    level: 'All Ages',
  },
  {
    id: 9,
    slug: 'stem-with-islamic-integration',
    title: 'STEM with Islamic Integration',
    category: 'STEM',
    image:
      'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=900&q=80',
    aspectRatio: '5 / 6',
    description:
      'Physics, technology, electronics and maths taught with Islamic integration.',
    overview:
      'A STEM program that encourages curiosity, invention, and structured problem-solving while connecting learning to Islamic values.',
    galleryImages: [
      'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=900&q=80',
    ],
    price: '$50/Month',
    duration: '16 weeks',
    level: 'Children and Teens',
  },
  {
    id: 10,
    slug: 'prophetic-attributes-training',
    title: 'Prophetic Attributes Training',
    category: 'Character',
    image:
      'https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=900&q=80',
    aspectRatio: '3 / 4',
    description:
      'Understand the most essential attributes needed for a successful life.',
    overview:
      'A values and character course centered on prophetic qualities and how to apply them in personal growth and daily life.',
    galleryImages: [
      'https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1499209974431-9dddcece7f88?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=80',
    ],
    price: '$50/Month',
    duration: '8 weeks',
    level: 'Children',
  },
];

const AllCourses = () => {
  const { formatFromUsdWhole } = useCurrency();
  const [apiCourses, setApiCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openFaqIndex, setOpenFaqIndex] = useState(0);
  const [isDesktopScrollZone, setIsDesktopScrollZone] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia(DESKTOP_SCROLL_ZONE_MQ).matches
  );

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/courses/public`, {
        cache: 'default',
      });
      if (!res.ok) {
        setApiCourses([]);
        return;
      }
      const data = await res.json();
      if (!data.success || !Array.isArray(data.courses)) {
        setApiCourses([]);
        return;
      }
      setApiCourses(data.courses);
    } catch (_) {
      setApiCourses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const displayCourses = apiCourses
    .map((c, index) => {
      const priceParts = getPriceDisplayParts(c.price, formatFromUsdWhole);
      return {
      id: c._id,
      _id: c._id,
      slug: c.slug || c._id,
      title: c.title || '',
      category: c.category || '',
      description: getFirstLine(c.description || ''),
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

  const masonryColumns = buildMasonryColumns(displayCourses);

  useEffect(() => {
    document.body.classList.add('courses-cursor-visible');
    return () => {
      document.body.classList.remove('courses-cursor-visible');
    };
  }, []);

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_SCROLL_ZONE_MQ);
    const handleChange = () => setIsDesktopScrollZone(mql.matches);
    handleChange();
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return (
    <section className="courses-page scheme_dark">
      <div className="courses-page-header">
        <h1 className="courses-page-title">All Courses</h1>
        <span className="courses-page-arrow" aria-hidden="true" />
      </div>

      <div className="courses-inner">
        <div className="courses-left">
          <div className="courses-left-panel">
            <div className="courses-left-content">
              <h1 className="courses-title">
              Learn Qur’an, Arabic, STEM, emotional intelligence and critical thinking in one place
              </h1>
              <img
                src={titleLineSvg}
                alt=""
                className="courses-title-line"
                aria-hidden="true"
              />
              <div className="courses-left-footer">
                <p className="courses-description">
                Explore a range of courses designed to strengthen your connection with the Qur’an, build Islamic understanding, and develop essential skills like problem-solving, reflection, and independent thinking.
                </p>
                <Link to="/contact" className="courses-cta">
                  <span className="courses-cta-text">Contact Us</span>
                  <span className="courses-cta-arrow" aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`courses-right${isDesktopScrollZone ? ' native-scroll-zone' : ''}`}
        >
          {loading ? (
            <div className="courses-loading">
              <p>Loading courses…</p>
            </div>
          ) : displayCourses.length === 0 ? (
            <div className="courses-empty">
              <p className="courses-empty-title">No courses to show</p>
              <p className="courses-empty-desc">Published courses from the course table will appear here.</p>
              <button type="button" className="courses-empty-btn" onClick={fetchCourses}>Refresh</button>
            </div>
          ) : (
          <div className="courses-masonry">
            {masonryColumns.map((columnCourses, columnIndex) => (
              <div key={columnIndex} className="courses-column">
                {columnCourses.map((course) => (
                  <Link
                    key={course.id || course._id}
                    to={`/courses/${courseUrlSegment(course)}`}
                    className="courses-item"
                  >
                    <div
                      className="courses-item-img-wrap"
                      style={{ aspectRatio: course.aspectRatio }}
                    >
                      <img
                        src={course.image}
                        alt={course.title}
                        loading="lazy"
                        width={400}
                        height={250}
                        sizes="(min-width: 993px) 50vw, 100vw"
                        onError={setImageFallbackToPlaceholder}
                      />
                    </div>
                    <div className="courses-item-caption">
                      <div className="courses-item-copy">
                        <h2 className="courses-item-title">{course.title}</h2>
                        <div className="courses-item-meta">
                          <span className="courses-item-price">
                            <span className="courses-item-price-amount">{course.priceDisplay}</span>
                            {course.priceShowMonth ? (
                              <span className="courses-item-price-period">Monthly</span>
                            ) : null}
                          </span>
                          <span className="courses-item-duration">{course.duration}</span>
                          <span className="courses-item-audience">{course.level}</span>
                        </div>
                      </div>
                      <span className="courses-item-arrow" aria-hidden="true">→</span>
                    </div>
                  </Link>
                ))}
              </div>
            ))}
          </div>
          )}
        </div>
      </div>

      <section className="courses-faq" aria-label="Frequently asked questions">
        <div className="courses-faq-title-wrap">
          <h2 className="courses-faq-title">FAQs</h2>
          <span className="courses-page-arrow courses-faq-arrow" aria-hidden="true" />
        </div>

        <div className="courses-faq-list" role="list">
          {faqs.map((item, idx) => {
            const isOpen = openFaqIndex === idx;
            const panelId = `courses-faq-panel-${idx}`;
            const buttonId = `courses-faq-button-${idx}`;
            return (
              <div key={item.question} className="courses-faq-item" role="listitem">
                <button
                  type="button"
                  id={buttonId}
                  className="courses-faq-trigger"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenFaqIndex((prev) => (prev === idx ? -1 : idx))}
                >
                  <span className="courses-faq-question">{item.question}</span>
                  <span className="courses-faq-icon" aria-hidden="true">
                    {isOpen ? '−' : '+'}
                  </span>
                </button>

                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className={`courses-faq-panel${isOpen ? ' courses-faq-panel--open' : ''}`}
                >
                  <div className="courses-faq-answer">{item.answer}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </section>
  );
};

export default AllCourses;
