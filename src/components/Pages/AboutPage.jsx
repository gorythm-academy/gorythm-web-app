import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { courses } from './AllCourses';
import VideoSection from '../HomeSections/Video';
import aboutImage1 from '../../assets/images/About-Sect-01.jpg';
import aboutImage2 from '../../assets/images/About-Sect-02.jpg';
import aboutUsMainImg from '../../assets/images/aboutUs-main-img.jpg';
import testimonialImg1 from '../../assets/images/milestone-img01.jpg';
import testimonialImg2 from '../../assets/images/milestone-img02.jpg';
import testimonialImg3 from '../../assets/images/emotional intelligence.jpg';
import './AboutPage.scss';

const studentTestimonials = [
  {
    name: 'Aisha Rahman',
    role: 'Student',
    image: testimonialImg1,
    quote: [
      'The teachers here meet you where you are — patient, clear, and deeply rooted in the Quran. I finally feel confident reciting with tajweed instead of rushing through words I did not understand.',
      'The live sessions and structured practice between classes made a real difference. I would recommend this academy to anyone who wants serious learning with a warm community.',
    ],
  },
  {
    name: 'Yusuf Khan',
    role: 'Student',
    image: testimonialImg2,
    quote: [
      'I joined for Islamic studies and stayed for how everything connects back to character and daily life. The lessons are engaging and never feel like a lecture you forget the next day.',
      'My parents noticed a positive change in how I approach salah and reflection. That is the kind of growth I was hoping for.',
    ],
  },
  {
    name: 'Maryam Siddiqui',
    role: 'Student',
    image: testimonialImg3,
    quote: [
      'As a busy student, I needed flexibility without losing quality. The platform is easy to follow and the support team actually responds when you need help.',
      'Being able to revisit recordings and notes helped me keep pace. I am grateful for instructors who care about progress, not just attendance.',
    ],
  },
  {
    name: 'Ibrahim Hassan',
    role: 'Student',
    image: aboutImage1,
    quote: [
      'STEM with Islamic integration sounded ambitious, but the course design makes it practical. We solve real problems while keeping ethics and adab at the center.',
      'Group projects taught me teamwork and how to disagree respectfully — skills I will use long after the term ends.',
    ],
  },
  {
    name: 'Fatima Noor',
    role: 'Student',
    image: aboutImage2,
    quote: [
      'I was nervous speaking up in class at first. The small group sizes and encouraging feedback helped me find my voice.',
      'Today I lead a short reflection for my family after Maghrib sometimes. That confidence started in these sessions.',
    ],
  },
  {
    name: 'Omar Malik',
    role: 'Student',
    image: aboutUsMainImg,
    quote: [
      'From enrollment to coursework, everything felt organized and professional. You can tell the team has thought through the learner journey.',
      'I have studied online before; this is the first place where I felt accountable in a good way — challenged but never overwhelmed.',
    ],
  },
];

const values = [
  {
    title: 'Solidarity',
    description: 'Standing together as an ummah, supporting and uplifting one another. We believe in the strength of community and the power of collective action to create positive change. Every voice matters, and every hand extended builds a stronger future.',
  },
  {
    title: 'Excellence',
    description: 'Striving for the highest standards in education, character, and service. We hold ourselves accountable to deliver quality in everything we do, from curriculum design to student support. Excellence is not a destination but a continuous journey we walk together.',
  },
  {
    title: 'Integrity',
    description: 'Upholding honesty, trust, and Islamic ethics in all we do. Our actions are guided by transparency and a deep sense of responsibility. We build lasting trust with our learners, families, and partners through consistency and moral clarity.',
  },
];

// Typewriter words (change these; keep longest word in spacer below for layout)
const statementWords = ['spiritually', ' emotionally', ' practically.'];

const approach = [
  {
    title: 'Quran-centered Curriculum',
    description: 'Every lesson is rooted in the teachings and wisdom of the Quran.',
  },
  {
    title: 'Character-building',
    description: 'Focusing on personal growth through Prophetic stories and values.',
  },
  {
    title: 'STEM & Islamic Integration',
    description: 'Blending modern STEM principles with timeless Islamic insights.',
  },
];

const AboutPage = () => {
  const [statementWordIndex, setStatementWordIndex] = useState(0);
  const [statementCharIndex, setStatementCharIndex] = useState(0);
  const [statementErasing, setStatementErasing] = useState(false);
  const [testimonialStart, setTestimonialStart] = useState(0);

  const testimonialCount = studentTestimonials.length;
  const testimonialIndex = (offset) =>
    ((testimonialStart + offset) % testimonialCount + testimonialCount) % testimonialCount;
  const visibleTestimonialIndices = [0, 1, 2].map(testimonialIndex);
  const activeTestimonial = studentTestimonials[testimonialStart];

  const goPrevTestimonial = () => {
    setTestimonialStart((s) => (s - 1 + testimonialCount) % testimonialCount);
  };

  const goNextTestimonial = () => {
    setTestimonialStart((s) => (s + 1) % testimonialCount);
  };

  useEffect(() => {
    const word = statementWords[statementWordIndex];
    if (!statementErasing) {
      if (statementCharIndex < word.length) {
        const t = setTimeout(() => setStatementCharIndex((c) => c + 1), 50);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setStatementErasing(true), 200);
      return () => clearTimeout(t);
    }
    if (statementCharIndex > 0) {
      const t = setTimeout(() => setStatementCharIndex((c) => c - 1), 50);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setStatementWordIndex((i) => (i + 1) % statementWords.length);
      setStatementErasing(false);
    }, 200);
    return () => clearTimeout(t);
  }, [statementWordIndex, statementCharIndex, statementErasing]);

  const showcaseItems = [
    {
      title: approach[0].title,
      description: approach[0].description,
      image: courses[0]?.image ?? aboutImage1,
    },
    {
      title: approach[1].title,
      description: approach[1].description,
      image: courses[1]?.image ?? aboutImage2,
    },
    {
      title: approach[2].title,
      description: approach[2].description,
      image: courses[2]?.image ?? aboutImage1,
    },
  ];

  return (
    <>
      <section className="about-page-dark">
        <div className="about-page-dark__page-header">
          <h1 className="about-page-dark__page-title">About Us</h1>
          <span className="about-page-dark__page-arrow" aria-hidden="true" />
        </div>

        <div className="about-page-dark__container">
          <section className="about-page-dark__intro">
            <div className="about-page-dark__intro-media">
              <div className="about-page-dark__intro-image">
                <img src={aboutUsMainImg} alt="About Al Farhan Academy" loading="lazy" width={800} height={500} />
              </div>
              <div className="about-page-dark__intro-badge">
                Explore a meaningful learning path forward
              </div>
            </div>

            <div className="about-page-dark__intro-copy">
              <h2>Embark on a learning journey with us</h2>
              <p>
                Providing a convenient platform for the world to understand the teachings of the
                Quran and Sunnah.
              </p>
              <ul className="about-page-dark__intro-points">
                <li>
                  <strong>Concept-Based Learning:</strong> Helping students understand, not just
                  memorize
                </li>
                <li>
                  <strong>Interactive Sessions:</strong> Encouraging participation and engagement
                </li>
                <li>
                  <strong>Faith Integration:</strong> Connecting every subject back to Islamic
                  values
                </li>
                <li>
                  <strong>Personal Growth:</strong> Building confidence, discipline, and emotional
                  awareness
                </li>
              </ul>
              <div className="about-page-dark__intro-actions">
                <Link to="/courses" className="about-page-dark__btn">
                  All Courses
                </Link>
              </div>
            </div>
          </section>

          <section className="about-page-dark__statement">
            <span className="about-page-dark__eyebrow">Our Ultimate Goal</span>
            <h2>
              To guide youth in aligning their lives with the principles of Islam so they can
              thrive{' '}
              {/* Fixed-width slot sized to the longest word so the heading never reflows */}
              <span className="about-page-dark__statement-words">
                <span className="about-page-dark__statement-spacer" aria-hidden="true">
                  {statementWords.reduce((a, b) => (a.length >= b.length ? a : b))}
                </span>
                <span
                  className={`about-page-dark__statement-word-current${statementCharIndex > 0 ? ' about-page-dark__statement-word-current--underlined' : ''}`}
                  aria-live="polite"
                >
                  {statementWords[statementWordIndex].slice(0, statementCharIndex)}
                </span>
              </span>
            </h2>
          </section>

          <section className="about-page-dark__values">
            <span className="about-page-dark__eyebrow">Our Values</span>
            <div className="about-page-dark__value-grid">
              {values.map((item) => (
                <article key={item.title} className="about-page-dark__value-card">
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>

      <VideoSection />

      <section className="about-page-dark about-page-dark--continuation">
        <div className="about-page-dark__container">
          <div className="about-page-dark__showcase-strip">
            <div className="about-page-dark__container about-page-dark__showcase-inner">
              <section className="about-page-dark__showcase">
                <span className="about-page-dark__eyebrow">Explore the Academy</span>
                <div className="about-page-dark__showcase-grid">
                  {showcaseItems.map((item) => (
                    <article key={item.title} className="about-page-dark__showcase-card">
                      <div className="about-page-dark__showcase-image">
                        <img src={item.image} alt={item.title} loading="lazy" width={400} height={250} sizes="(min-width: 768px) 400px, 100vw" />
                      </div>
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </div>

          <div className="about-page-dark__section-rule-wrap" aria-hidden="true">
            <hr className="about-page-dark__section-rule" />
          </div>

          <div className="about-page-dark__testimonials-strip">
            <div className="about-page-dark__container about-page-dark__testimonials-inner">
              <section
                className="about-page-dark__quote"
                aria-label="Student testimonials"
                aria-roledescription="carousel"
              >
                <span className="about-page-dark__eyebrow about-page-dark__eyebrow--on-dark">
                  Student Testimonials
                </span>
                <div className="about-page-dark__quote-row">
                  <div className="about-page-dark__avatars" role="group" aria-label="Students featured">
                    {visibleTestimonialIndices.map((studentIndex, slot) => {
                      const t = studentTestimonials[studentIndex];
                      const isActive = slot === 0;
                      return (
                        <div
                          key={`${studentIndex}-${testimonialStart}-${slot}`}
                          className={
                            isActive
                              ? 'about-page-dark__avatar-slot about-page-dark__avatar-slot--active'
                              : 'about-page-dark__avatar-slot'
                          }
                        >
                          <div className="about-page-dark__avatar-ring">
                            <span className="about-page-dark__avatar-photo">
                              <img src={t.image} alt="" width={96} height={96} loading="lazy" />
                              {!isActive ? (
                                <span className="about-page-dark__avatar-fade" aria-hidden="true" />
                              ) : null}
                            </span>
                            {isActive ? (
                              <span className="about-page-dark__avatar-quote-icon" aria-hidden="true">
                                “
                              </span>
                            ) : null}
                          </div>
                          {isActive ? (
                            <>
                              <div className="about-page-dark__avatar-name">{t.name}</div>
                              <div className="about-page-dark__avatar-role">{t.role}</div>
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <div className="about-page-dark__quote-copy">
                    <div
                      className="about-page-dark__quote-text"
                      aria-live="polite"
                      id="about-testimonial-quote"
                    >
                      {activeTestimonial.quote.map((paragraph, i) => (
                        <p key={i}>{paragraph}</p>
                      ))}
                    </div>
                    <div className="about-page-dark__quote-nav">
                      <button
                        type="button"
                        className="about-page-dark__quote-nav-btn"
                        onClick={goPrevTestimonial}
                        aria-label="Previous testimonial"
                        aria-controls="about-testimonial-quote"
                      >
                        <span aria-hidden="true">←</span>
                      </button>
                      <button
                        type="button"
                        className="about-page-dark__quote-nav-btn"
                        onClick={goNextTestimonial}
                        aria-label="Next testimonial"
                        aria-controls="about-testimonial-quote"
                      >
                        <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default AboutPage;
