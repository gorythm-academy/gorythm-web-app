import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import VideoSection from '../HomeSections/Video';
import aboutUsMainImg from '../../assets/images/about us/about-main-img.png';
import academyMissionImage from '../../assets/images/about us/our-mission.png';
import academyVisionImage from '../../assets/images/about us/our-vision.png';
import shaziaImg from '../../assets/images/our team/shazia.png';
import kamranImg from '../../assets/images/our team/kamran.png';
import sufiyanImg from '../../assets/images/our team/sufiyan.png';
import ahmedImg from '../../assets/images/our team/ahmed.png';
import mahamImg from '../../assets/images/our team/maham.png';
import fatimaImg from '../../assets/images/our team/fatima.png';
import farhanImg from '../../assets/images/our team/farhan.png';
import shahmeerImg from '../../assets/images/our team/shahmeer.png';

import gulsenImg from '../../assets/images/our team/Gülsen Yazici.png';
import './AboutPage.scss';

// Student testimonial section is intentionally commented out for now.

const values = [
  {
    title: 'Integrity',
    description: 'We prioritise honesty, trust, and ethical behaviour in everything we do. Our work is guided by transparency, consistency, and a strong sense of responsibility toward our learners and their families.',
  },
  {
    title: 'Community',
    description: 'We believe in the importance of connection, collaboration, and mutual support. By fostering a positive and inclusive environment, we encourage learners to grow together and support one another.',
  },
  {
    title: 'Excellence',
    description: 'We aim for high standards across all areas of learning and development. From course design to student support, we are committed to delivering quality and continuously improving our approach.',
  },
];

// Typewriter words (change these; keep longest word in spacer below for layout)
const statementWords = ['spiritually', ' emotionally', ' practically.'];

const teamMembers = [
  { name: 'Shazia Shahab', role: 'CEO, Gorythm', country: 'Netherlands', image: shaziaImg },
  { name: 'Syed Kamran Ahmad', role: 'Systems Engineering Manager', country: 'Saudi Arabia', image: kamranImg },
  {
    name: 'Gülsen Yazici',
    role: 'Psychosocial Systems and Gestalt Therapist',
    country: 'Netherlands',
    image: gulsenImg,
  },
  { name: 'Farhan Gondal', role: 'IT Consultant', country: 'Pakistan', image: farhanImg },
  {
    name: 'Sufiyan Nadeem',
    role: 'CEO, Earth movers International',
    country: 'United Arab Emirates',
    image: sufiyanImg,
  },
  {
    name: 'Ahmed Bin Rashid',
    role: 'Graphics Designer and Poet',
    country: 'Pakistan',
    image: ahmedImg,
  },
  { name: 'Maham Jaffery', role: 'Communications Head, Gorythm', country: 'Pakistan', image: mahamImg },
  { name: 'Fatima Rashid', role: 'Communications Specialist, Gorythm', country: 'Pakistan', image: fatimaImg },
  { name: 'Syed Shahmeer Ahmed', role: 'Accounts, Gorythm', country: 'Pakistan', image: shahmeerImg },
  
];

const academyHighlights = [
  {
    title: 'Our Mission',
    description:
      'To provide accessible and engaging education that supports learners in developing knowledge, confidence, and strong personal values. We aim to create meaningful learning experiences that help individuals grow, think independently, and navigate the modern world with purpose.',
    image: academyMissionImage,
  },
  {
    title: 'Our Vision',
    description:
      'To become a global platform for impactful learning, empowering a generation to grow with confidence, integrity, and a strong sense of purpose.',
    image: academyVisionImage,
  },
];

const AboutPage = () => {
  const [statementWordIndex, setStatementWordIndex] = useState(0);
  const [statementCharIndex, setStatementCharIndex] = useState(0);
  const [statementErasing, setStatementErasing] = useState(false);
  const [activeAcademySlide, setActiveAcademySlide] = useState(0);
  const [isAcademyDragging, setIsAcademyDragging] = useState(false);
  const [isAcademyFlipping, setIsAcademyFlipping] = useState(false);
  const academySliderRef = useRef(null);
  const academyPointerIdRef = useRef(null);
  const academyDragStartXRef = useRef(0);
  const academyDragDeltaXRef = useRef(0);

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
    if (isAcademyDragging) return undefined;
    const intervalId = setInterval(() => {
      setIsAcademyFlipping(true);
      setActiveAcademySlide((prevIndex) => (prevIndex + 1) % academyHighlights.length);
    }, 7000);
    return () => clearInterval(intervalId);
  }, [isAcademyDragging]);

  useEffect(() => {
    setActiveAcademySlide((prevIndex) => {
      if (academyHighlights.length === 0) return 0;
      return prevIndex % academyHighlights.length;
    });
  }, []);

  useEffect(() => {
    if (!isAcademyFlipping) return undefined;
    const timer = setTimeout(() => setIsAcademyFlipping(false), 1000);
    return () => clearTimeout(timer);
  }, [isAcademyFlipping]);

  const handleAcademyPointerDown = (event) => {
    if (!academySliderRef.current) return;
    academyPointerIdRef.current = event.pointerId;
    academyDragStartXRef.current = event.clientX;
    academyDragDeltaXRef.current = 0;
    setIsAcademyDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleAcademyPointerMove = (event) => {
    if (!isAcademyDragging || event.pointerId !== academyPointerIdRef.current) return;
    const dragDelta = event.clientX - academyDragStartXRef.current;
    academyDragDeltaXRef.current = dragDelta;
  };

  const handleAcademyPointerUp = (event) => {
    if (event.pointerId !== academyPointerIdRef.current) return;
    const sliderWidth = academySliderRef.current?.offsetWidth ?? 0;
    const threshold = Math.max(56, sliderWidth * 0.12);
    const dragDelta = academyDragDeltaXRef.current;

    if (dragDelta <= -threshold) {
      setIsAcademyFlipping(true);
      setActiveAcademySlide((prevIndex) => (prevIndex + 1) % academyHighlights.length);
    } else if (dragDelta >= threshold) {
      setIsAcademyFlipping(true);
      setActiveAcademySlide(
        (prevIndex) => (prevIndex - 1 + academyHighlights.length) % academyHighlights.length
      );
    }

    setIsAcademyDragging(false);
    academyPointerIdRef.current = null;
    academyDragDeltaXRef.current = 0;
  };

  const activeAcademyItem = academyHighlights[activeAcademySlide] ?? academyHighlights[0];

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

      <section className="about-page-team" aria-label="Our team">
        <div className="about-page-team__container">
          <header className="about-page-team__header about-page-dark__title-with-arrow">
            <h2 className="about-page-team__title">Our Team</h2>
            <span className="about-page-dark__page-arrow" aria-hidden="true" />
          </header>

          <div className="about-page-team__grid">
            {teamMembers.map((member) => (
              <article key={member.name} className="about-page-team__card">
                <div className="about-page-team__media">
                  <img src={member.image} alt={member.name} loading="lazy" width={420} height={540} />
                </div>
                <h3 className="about-page-team__name">{member.name}</h3>
                <p className="about-page-team__role">{member.role}</p>
                <p className="about-page-team__country">{member.country}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="about-page-dark about-page-dark--continuation">
        <div className="about-page-dark__container">
          <div className="about-page-dark__showcase-strip">
            <div className="about-page-dark__container about-page-dark__showcase-inner">
              <section className="about-page-dark__showcase">
                <div
                  className={`about-page-dark__academy-slider${isAcademyDragging ? ' about-page-dark__academy-slider--dragging' : ''}`}
                  aria-label="Explore the Academy slider"
                  ref={academySliderRef}
                  onPointerDown={handleAcademyPointerDown}
                  onPointerMove={handleAcademyPointerMove}
                  onPointerUp={handleAcademyPointerUp}
                  onPointerCancel={handleAcademyPointerUp}
                  onPointerLeave={handleAcademyPointerUp}
                >
                  <article
                    key={activeAcademySlide}
                    className={`about-page-dark__academy-slide${isAcademyFlipping ? ' about-page-dark__academy-slide--flip' : ''}`}
                  >
                    <div className="about-page-dark__academy-media">
                      <h3 className="about-page-dark__academy-media-title">{activeAcademyItem.title}</h3>
                      <img
                        src={activeAcademyItem.image}
                        alt={activeAcademyItem.title}
                        loading="lazy"
                        width={1024}
                        height={403}
                        sizes="(min-width: 1200px) 1024px, (min-width: 700px) calc(100vw - 80px), 100vw"
                      />
                    </div>
                    <div className="about-page-dark__academy-copy">
                      <p className="about-page-dark__explore-desc">{activeAcademyItem.description}</p>
                    </div>
                  </article>
                  <div className="about-page-dark__academy-dots" role="tablist" aria-label="Slide selector">
                    {academyHighlights.map((item, index) => (
                      <button
                        key={item.title}
                        type="button"
                        role="tab"
                        aria-selected={index === activeAcademySlide}
                        aria-label={`Show ${item.title}`}
                        className={`about-page-dark__academy-dot${index === activeAcademySlide ? ' about-page-dark__academy-dot--active' : ''}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => {
                          setIsAcademyFlipping(true);
                          setActiveAcademySlide(index);
                        }}
                      />
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </div>

          {/* <div className="about-page-dark__testimonials-strip">
            <div className="about-page-dark__container about-page-dark__testimonials-inner">
              <section className="about-page-dark__quote" aria-label="Student testimonials" />
            </div>
          </div> */}

        </div>
      </section>
    </>
  );
};

export default AboutPage;
