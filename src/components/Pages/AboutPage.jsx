import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FACEBOOK_URL } from '../../config/constants';
import { courses } from './AllCourses';
import VideoSection from '../HomeSections/Video';
import aboutImage1 from '../../assets/images/About-Sect-01.jpg';
import aboutImage2 from '../../assets/images/About-Sect-02.jpg';
import aboutUsMainImg from '../../assets/images/aboutUs-main-img.jpg';
import './AboutPage.scss';

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
                <li>Passionate educators, researchers, and mentors</li>
                <li>Dynamic and innovative Islamic learning experience</li>
                <li>Quran and Sunnah rooted guidance for modern learners</li>
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
              <span className="about-page-dark__statement-words">
                <span
                  className={`about-page-dark__statement-word-current${statementCharIndex > 0 ? ' about-page-dark__statement-word-current--underlined' : ''}`}
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

          <section className="about-page-dark__quote">
            <div className="about-page-dark__avatars" aria-hidden="true">
              <span>A</span>
              <span>F</span>
              <span>A</span>
            </div>
            <div className="about-page-dark__quote-copy">
              <p>
                We are a team of passionate educators, researchers, and mentors dedicated to
                delivering a transformative learning experience. Our mission is to raise a
                generation with clarity, integrity, and strength to lead by example.
              </p>
              <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer">
                Join us on Facebook
              </a>
            </div>
          </section>
        </div>
      </section>
    </>
  );
};

export default AboutPage;
