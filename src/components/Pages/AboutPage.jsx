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

// Student testimonial section is intentionally commented out for now.

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

const teamMembers = [
  { name: 'Tina Jones', role: 'Scientist', image: aboutImage1 },
  { name: 'Natalie Coleman', role: 'Astrophysicist', image: testimonialImg1 },
  { name: 'Richard Gilmore', role: 'Engineer', image: testimonialImg2 },
  { name: 'Nicole Carter', role: 'Astronomer', image: aboutImage2 },
  { name: 'Michael Lewis', role: 'Engineer', image: aboutUsMainImg },
  { name: 'Christina Newman', role: 'Scientist', image: testimonialImg3 },
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
