import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import VideoSection from '../HomeSections/Video';
import OptimizedPicture from '../OptimizedPicture/OptimizedPicture';

// PNGs remain the authoring + universal fallback; AVIF/WebP are generated beside them (`npm run optimize-images`).
import aboutIntroPng from '../../assets/images/about us/about-main-img.png';
import aboutIntroWebp from '../../assets/images/about us/about-main-img.webp';
import aboutIntroAvif from '../../assets/images/about us/about-main-img.avif';

import academyMissionPng from '../../assets/images/about us/our-mission.png';
import academyMissionWebp from '../../assets/images/about us/our-mission.webp';
import academyMissionAvif from '../../assets/images/about us/our-mission.avif';

import academyVisionPng from '../../assets/images/about us/our-vision.png';
import academyVisionWebp from '../../assets/images/about us/our-vision.webp';
import academyVisionAvif from '../../assets/images/about us/our-vision.avif';

import shaziaPng from '../../assets/images/our team/shazia.png';
import shaziaWebp from '../../assets/images/our team/shazia.webp';
import shaziaAvif from '../../assets/images/our team/shazia.avif';

import kamranPng from '../../assets/images/our team/kamran.png';
import kamranWebp from '../../assets/images/our team/kamran.webp';
import kamranAvif from '../../assets/images/our team/kamran.avif';

import sufiyanPng from '../../assets/images/our team/sufiyan.png';
import sufiyanWebp from '../../assets/images/our team/sufiyan.webp';
import sufiyanAvif from '../../assets/images/our team/sufiyan.avif';

import ahmedPng from '../../assets/images/our team/ahmed.png';
import ahmedWebp from '../../assets/images/our team/ahmed.webp';
import ahmedAvif from '../../assets/images/our team/ahmed.avif';

import mahamPng from '../../assets/images/our team/maham.png';
import mahamWebp from '../../assets/images/our team/maham.webp';
import mahamAvif from '../../assets/images/our team/maham.avif';

import fatimaPng from '../../assets/images/our team/fatima.png';
import fatimaWebp from '../../assets/images/our team/fatima.webp';
import fatimaAvif from '../../assets/images/our team/fatima.avif';

import farhanPng from '../../assets/images/our team/farhan.png';
import farhanWebp from '../../assets/images/our team/farhan.webp';
import farhanAvif from '../../assets/images/our team/farhan.avif';

import shahmeerPng from '../../assets/images/our team/shahmeer.png';
import shahmeerWebp from '../../assets/images/our team/shahmeer.webp';
import shahmeerAvif from '../../assets/images/our team/shahmeer.avif';

import gulsenPng from '../../assets/images/our team/Gülsen Yazici.png';
import gulsenWebp from '../../assets/images/our team/Gülsen Yazici.webp';
import gulsenAvif from '../../assets/images/our team/Gülsen Yazici.avif';

import './AboutPage.scss';

// Student testimonial section is intentionally commented out for now.

const values = [
  {
    title: 'Integrity',
    description:
      'We publish what we believe to be true. Our research is held to a high standard, and when certainty is not possible, we say so. Honesty is not a policy here. It is a conviction.',
  },
  {
    title: 'Community',
    description:
      'Community Learning deepens in connection. We build environments where every learner belongs not as a number, but as a person with a name, a story, and a reason for being here.',
  },
  {
    title: 'Excellence',
    description:
      ' From course design to student support, we do not settle. We improve because the work demands it and because the people we serve deserve nothing less.',
  },
  {
    title: 'Faith',
    description:
      'Every value we hold is anchored in something larger than preference or opinion. Faith is not a filter we apply selectively. It is the foundation on which everything else is built on.',
  },
];

// Typewriter words (change these; keep longest word in spacer below for layout)
const statementWords = ['emotional', 'intellectual', 'physical'];

const teamMembers = [
  {
    name: 'Shazia Shahab',
    role: 'CEO, Gorythm',
    country: 'Netherlands',
    raster: { avif: shaziaAvif, webp: shaziaWebp, png: shaziaPng },
  },
  {
    name: 'Syed Kamran Ahmad',
    role: 'Systems Engineering Manager',
    country: 'Saudi Arabia',
    raster: { avif: kamranAvif, webp: kamranWebp, png: kamranPng },
  },
  {
    name: 'Gülsen Yazici',
    role: 'Psychosocial Systems and Gestalt Therapist',
    country: 'Netherlands',
    raster: { avif: gulsenAvif, webp: gulsenWebp, png: gulsenPng },
  },
  {
    name: 'Farhan Gondal',
    role: 'IT Consultant',
    country: 'Pakistan',
    raster: { avif: farhanAvif, webp: farhanWebp, png: farhanPng },
  },
  {
    name: 'Sufiyan Nadeem',
    role: 'CEO, Earth movers International',
    country: 'United Arab Emirates',
    raster: { avif: sufiyanAvif, webp: sufiyanWebp, png: sufiyanPng },
  },
  {
    name: 'Ahmed Bin Rashid',
    role: 'Graphics Designer and Poet',
    country: 'Pakistan',
    raster: { avif: ahmedAvif, webp: ahmedWebp, png: ahmedPng },
  },
  {
    name: 'Maham Jaffery',
    role: 'Communications Head, Gorythm',
    country: 'Pakistan',
    raster: { avif: mahamAvif, webp: mahamWebp, png: mahamPng },
  },
  {
    name: 'Fatima Rashid',
    role: 'Communications Specialist, Gorythm',
    country: 'Pakistan',
    raster: { avif: fatimaAvif, webp: fatimaWebp, png: fatimaPng },
  },
  {
    name: 'Syed Shahmeer Ahmed',
    role: 'Accounts, Gorythm',
    country: 'Pakistan',
    raster: { avif: shahmeerAvif, webp: shahmeerWebp, png: shahmeerPng },
  },
];

const academyHighlights = [
  {
    title: 'Our Mission',
    description:
      ' To make rigorous, meaningful education accessible to every learner grounded in faith, and built around the intellectual, emotional, and physical foundations needed to live with purpose and clarity.',
    raster: { avif: academyMissionAvif, webp: academyMissionWebp, png: academyMissionPng },
  },
  {
    title: 'Our Vision',
    description:
      'To become a global centre for human development where research, character, and self-knowledge converge, and where faith gives direction to everything we build. We exist to produce people who know who they are, why they are here, and how to act accordingly.',
    raster: { avif: academyVisionAvif, webp: academyVisionWebp, png: academyVisionPng },
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
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!academySliderRef.current) return;
    if (event.pointerType === 'mouse') event.preventDefault();
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
    const threshold = event.pointerType === 'mouse' ? 24 : Math.max(56, sliderWidth * 0.12);
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
  const academyTitleParts = activeAcademyItem.title.match(/^(\S+)\s+(.+)$/);
  const academyTitlePrefix = academyTitleParts ? academyTitleParts[1] : activeAcademyItem.title;
  const academyTitleFocus = academyTitleParts ? academyTitleParts[2] : '';

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
                {/* Below-fold on many layouts — lazy keeps bandwidth for hero/LCP on Home */}
                <OptimizedPicture
                  avifSrc={aboutIntroAvif}
                  webpSrc={aboutIntroWebp}
                  fallbackSrc={aboutIntroPng}
                  alt="About Al Farhan Academy"
                  loading="lazy"
                  width={800}
                  height={500}
                />
              </div>
              <div className="about-page-dark__intro-badge">
              Research first<br />
              Teaching second<br />
              Always
              </div>
            </div>

            <div className="about-page-dark__intro-copy">
              <h2>Four principles behind every program</h2>
              <p>
              Everything you learn at Gorythm is ours researched, written, and structured in-house.
              </p>
              <ul className="about-page-dark__intro-points">
                <li>
                  <strong>Concept First:</strong>                 We teach the why before the what. Our own curriculum is built to develop understanding, not memorisation.
                  </li>
                <li>
                  <strong>Interactive Sessions:</strong> Every session is a conversation. Our content is designed to create space for reflection, dialogue, and real engagement.

                </li>
                <li>
                  <strong>Values-led:</strong> Each lesson connects to real life. Our material is written to build judgment, not just deliver answers.

                </li>
                <li>
                  <strong>Whole-person:</strong> Academic progress is one part. Our programs are built around the whole person confidence, discipline, and self-awareness included.
 
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
            To guide youth in aligning their lives with the principles of faith so they can thrive
            {' '}
              {/* Fixed-width slot sized to the longest word so the heading never reflows */}
              <span className="about-page-dark__statement-words">
                <span className="about-page-dark__statement-spacer" aria-hidden="true">
                  {statementWords.reduce((a, b) => (a.length >= b.length ? a : b))}
                </span>
                <span className="about-page-dark__statement-word-current" aria-live="polite">
                  {statementWords[statementWordIndex]
                    .slice(0, statementCharIndex)
                    .split('')
                    .map((ch, i) => (
                      <span
                        key={`${statementWordIndex}-${i}`}
                        className="about-page-dark__statement-char"
                      >
                        {ch}
                      </span>
                    ))}
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
                Gorythm began as an initiative of Al Farhan Academy, born from the conviction that meaningful education was never just about content delivery. It was about shaping how a person understands themselves and the world around them.

                </p>
                <p>
                We saw a gap. Learners were absorbing more than ever and integrating less. Facts without frameworks. Information without identity. Knowledge without the one thing that gives it direction, faith.
                </p>
                <p>
                So we built something different, a platform where every topic connects to a coherent worldview, every course is grounded in research, and every lesson points toward something larger than itself. We do not cover subjects in isolation. We cover every dimension of a human being because real development does not happen in parts. And at the centre of it all is a foundational belief: that truth is coherent, that the human being was created with purpose, and that education, at its highest, is an act of remembrance.
                </p>
                <p>
                A person is not one thing. And neither is real education.

                </p>
                <p>
                Gorythm was built to meet every dimension of who you are intellectually, emotionally, physically, and spiritually. Everything we teach is filtered through faith, grounded in research, and oriented toward the kind of growth that actually lasts.
</p>
              </div>
            </div>

            
          </section>

          <section className="about-page-dark__values">
            <span className="about-page-dark__eyebrow">What guides every decision we make</span>
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
                  <OptimizedPicture
                    avifSrc={member.raster.avif}
                    webpSrc={member.raster.webp}
                    fallbackSrc={member.raster.png}
                    alt={member.name}
                    loading="lazy"
                    width={420}
                    height={540}
                  />
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
                >
                  <article
                    key={activeAcademySlide}
                    className={`about-page-dark__academy-slide${isAcademyFlipping ? ' about-page-dark__academy-slide--flip' : ''}`}
                  >
                    <div className="about-page-dark__academy-media">
                      <h3 className="about-page-dark__academy-media-title">
                        <span className="about-page-dark__academy-media-title-prefix">{academyTitlePrefix}</span>
                        {academyTitleFocus ? (
                          <span className="about-page-dark__academy-media-title-focus">{academyTitleFocus}</span>
                        ) : null}
                      </h3>
                      <OptimizedPicture
                        avifSrc={activeAcademyItem.raster.avif}
                        webpSrc={activeAcademyItem.raster.webp}
                        fallbackSrc={activeAcademyItem.raster.png}
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
