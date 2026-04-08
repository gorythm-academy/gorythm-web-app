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

const AboutPage = () => {
  const [statementWordIndex, setStatementWordIndex] = useState(0);
  const [statementCharIndex, setStatementCharIndex] = useState(0);
  const [statementErasing, setStatementErasing] = useState(false);
  const [testimonialStart, setTestimonialStart] = useState(0);
  const [testimonialSlideDir, setTestimonialSlideDir] = useState(null);
  const [isTestimonialDragging, setIsTestimonialDragging] = useState(false);
  const [testimonialCursorDot, setTestimonialCursorDot] = useState({ x: 0, y: 0, visible: false });
  const [openFaqIndex, setOpenFaqIndex] = useState(0);
  const dragActiveRef = React.useRef(false);
  const dragStartXRef = React.useRef(0);
  const dragThreshold = 56;
  const testimonialsRef = React.useRef(null);

  const testimonialCount = studentTestimonials.length;
  const testimonialIndex = (offset) =>
    ((testimonialStart + offset) % testimonialCount + testimonialCount) % testimonialCount;
  const visibleTestimonialIndices = [0, 1, 2].map(testimonialIndex);
  const activeTestimonial = studentTestimonials[testimonialStart];

  const goPrevTestimonial = () => {
    setTestimonialSlideDir('prev');
    setTestimonialStart((s) => (s - 1 + testimonialCount) % testimonialCount);
  };

  const goNextTestimonial = () => {
    setTestimonialSlideDir('next');
    setTestimonialStart((s) => (s + 1) % testimonialCount);
  };

  const onTestimonialPointerDown = (e) => {
    // Only primary button for mouse; allow touch/pen.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragActiveRef.current = true;
    dragStartXRef.current = e.clientX;
    setIsTestimonialDragging(true);
  };

  const onTestimonialPointerMove = (e) => {
    if (!dragActiveRef.current) return;
    const delta = e.clientX - dragStartXRef.current;
    if (Math.abs(delta) < dragThreshold) return;
    if (delta > 0) goPrevTestimonial();
    else goNextTestimonial();
    dragStartXRef.current = e.clientX;
  };

  const stopTestimonialDrag = () => {
    if (!dragActiveRef.current) return;
    dragActiveRef.current = false;
    setIsTestimonialDragging(false);
  };

  const onTestimonialsMouseMove = (e) => {
    if (typeof window !== 'undefined' && !window.matchMedia('(pointer: fine)').matches) return;
    const el = testimonialsRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTestimonialCursorDot({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      visible: true,
    });
  };

  const onTestimonialsMouseEnter = (e) => {
    onTestimonialsMouseMove(e);
  };

  const onTestimonialsMouseLeave = () => {
    setTestimonialCursorDot((prev) => ({ ...prev, visible: false }));
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

  useEffect(() => {
    if (!testimonialSlideDir) return undefined;
    const t = setTimeout(() => setTestimonialSlideDir(null), 520);
    return () => clearTimeout(t);
  }, [testimonialSlideDir]);

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

  const exploreAcademyItems = [
    {
      title: 'Our Mission',
      description:
        'To provide accessible, engaging, and faith-centered education that connects learners with the Qur’an, Arabic, and Islamic values. We aim to nurture knowledge, character, and confidence, helping individuals grow spiritually while navigating the modern world with purpose.',
      image: showcaseItems[0]?.image ?? aboutImage2,
    },
    {
      title: 'Our Vision',
      description:
        'To become a global platform for transformative Islamic learning, empowering a generation that lives with strong faith, ethical values, and a deep connection to the Qur’an, contributing positively to society.',
      image: showcaseItems[1]?.image ?? aboutImage1,
    },
    {
      title: 'Our Projects',
      description:
        'At GoRythm, our projects focus on meaningful research and exploration of classical and contemporary Islamic knowledge. We study authentic books and scholarly works to better understand the Qur’an, Sunnah, and various aspects of Islamic norms and practices. Through this, we aim to present knowledge in a way that is relevant, structured, and beneficial for modern learners, helping them connect deeply with their faith while applying it in everyday life.',
      image: showcaseItems[2]?.image ?? aboutImage2,
    },
    {
      title: 'Our Commitment',
      description:
      'We are committed to providing a learning experience that is both high in quality and deeply rooted in faith. Our teachers are dedicated to guiding each student with care, ensuring progress at every step. At GoRythm, we don’t just teach,  we aim to inspire a lifelong connection with knowledge, faith, and personal development.',
      image: showcaseItems[2]?.image ?? aboutImage2,
    },


    {
      title: 'Educational Programs',
      description:
        'At GoRythm, we blend Islamic values with modern learning to nurture young minds and strengthen faith through knowledge. Our programs go beyond textbooks, helping learners think critically, act ethically, and grow with purpose.',
      image: showcaseItems[0]?.image ?? aboutImage1,
    },
    {
      title: 'STEM Education with an Islamic Perspective',
      description:
        'Our STEM Education program integrates Science, Technology, Engineering, and Mathematics with Islamic principles, helping students explore innovation through faith. Learners develop problem-solving, creativity, and curiosity while understanding how modern knowledge aligns with the wisdom of the Qur’an.',
      image: showcaseItems[1]?.image ?? aboutImage2,
    },
    {
      title: 'Life Skills & Character Development',
      description:
        'This program focuses on emotional growth, communication, leadership, and empathy, all grounded in Islamic teachings. Through interactive lessons and real-life scenarios, students learn to navigate challenges and build strong moral character.',
      image: showcaseItems[2]?.image ?? aboutImage1,
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

          <section className="about-page-dark__about-gorythm">
            <div className="about-page-dark__about-gorythm-block">
              <span className="about-page-dark__eyebrow about-page-dark__eyebrow--center">
                About GoRythm
              </span>
              <div className="about-page-dark__section-copy">
                <p>
                  GoRythm is a project of Al Farhan Academy, created to provide meaningful and
                  engaging Islamic education for learners of all ages. Our mission is to make
                  learning accessible, relevant, and deeply rooted in faith.
                </p>
                <p>
                  We believe that education is not just about knowledge, it is about
                  transformation. Through our carefully designed programs, we aim to nurture
                  confident individuals who live with purpose, اخلاق (Akhlaq), and a strong
                  connection with Allah.
                </p>
                <p>
                  Our approach combines traditional Islamic teachings with modern educational
                  methods, ensuring that every learner benefits both spiritually and
                  intellectually.
                </p>
              </div>
            </div>

            <div className="about-page-dark__about-gorythm-block">
              <span className="about-page-dark__eyebrow about-page-dark__eyebrow--center">
                Our Story
              </span>
              <div className="about-page-dark__section-copy">
                <p>
                  GoRythm was created as a forward-thinking initiative of Al Farhan Academy to
                  make Islamic education more engaging, accessible, and relevant for today’s
                  learners. Recognizing the need for a balanced approach, we combined traditional
                  Islamic knowledge with modern teaching methods to create a platform that speaks
                  to both the heart and mind.
                </p>
                <p>
                  Our journey began with a simple goal, to help learners connect with the Qur’an
                  and Islamic values in a way that is meaningful, practical, and lifelong.
                </p>
              </div>
            </div>
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
                <div className="about-page-dark__explore-list" aria-label="Explore the Academy list">
                  {exploreAcademyItems.map((item) => (
                    <article key={item.title} className="about-page-dark__explore-item">
                      <div className="about-page-dark__explore-media">
                        <img
                          src={item.image}
                          alt=""
                          loading="lazy"
                          width={900}
                          height={520}
                          sizes="(min-width: 900px) 520px, 100vw"
                        />
                      </div>
                      <div className="about-page-dark__explore-copy">
                        <h3 className="about-page-dark__explore-title">{item.title}</h3>
                        <p className="about-page-dark__explore-desc">{item.description}</p>
                      </div>
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
                ref={testimonialsRef}
                className={`about-page-dark__quote${isTestimonialDragging ? ' about-page-dark__quote--dragging' : ''}`}
                aria-label="Student testimonials"
                aria-roledescription="carousel"
                onPointerDown={onTestimonialPointerDown}
                onPointerMove={onTestimonialPointerMove}
                onPointerUp={stopTestimonialDrag}
                onPointerCancel={stopTestimonialDrag}
                onPointerLeave={stopTestimonialDrag}
                onMouseMove={onTestimonialsMouseMove}
                onMouseEnter={onTestimonialsMouseEnter}
                onMouseLeave={onTestimonialsMouseLeave}
              >
                {testimonialCursorDot.visible ? (
                  <span
                    className="about-page-dark__testimonials-cursor-dot"
                    style={{ left: `${testimonialCursorDot.x}px`, top: `${testimonialCursorDot.y}px` }}
                    aria-hidden="true"
                  />
                ) : null}
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
                      className={`about-page-dark__quote-text${testimonialSlideDir === 'next' ? ' about-page-dark__quote-text--slide-next' : ''}${testimonialSlideDir === 'prev' ? ' about-page-dark__quote-text--slide-prev' : ''}`}
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

          <div className="about-page-dark__faq-strip">
            <div className="about-page-dark__container about-page-dark__faq-inner">
              <section className="about-page-dark__faq" aria-label="Frequently asked questions">
                <h2 className="about-page-dark__faq-title">FAQs</h2>
                <span className="about-page-dark__page-arrow about-page-dark__faq-arrow" aria-hidden="true" />

                <div className="about-page-dark__faq-list" role="list">
                  {faqs.map((item, idx) => {
                    const isOpen = openFaqIndex === idx;
                    const panelId = `about-faq-panel-${idx}`;
                    const buttonId = `about-faq-button-${idx}`;
                    return (
                      <div key={item.question} className="about-page-dark__faq-item" role="listitem">
                        <button
                          type="button"
                          id={buttonId}
                          className="about-page-dark__faq-trigger"
                          aria-expanded={isOpen}
                          aria-controls={panelId}
                          onClick={() => setOpenFaqIndex((prev) => (prev === idx ? -1 : idx))}
                        >
                          <span className="about-page-dark__faq-question">{item.question}</span>
                          <span
                            className="about-page-dark__faq-icon"
                            aria-hidden="true"
                          >
                            {isOpen ? '−' : '+'}
                          </span>
                        </button>

                        <div
                          id={panelId}
                          role="region"
                          aria-labelledby={buttonId}
                          className={`about-page-dark__faq-panel${isOpen ? ' about-page-dark__faq-panel--open' : ''}`}
                        >
                          <div className="about-page-dark__faq-answer">{item.answer}</div>
                        </div>
                      </div>
                    );
                  })}
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
