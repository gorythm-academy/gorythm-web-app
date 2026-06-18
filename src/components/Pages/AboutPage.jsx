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

import muhammadMunimAnsariPng from '../../assets/images/our team/Muhammad Munim Ansari.png';
import muhammadMunimAnsariWebp from '../../assets/images/our team/Muhammad Munim Ansari.webp';
import muhammadMunimAnsariAvif from '../../assets/images/our team/Muhammad Munim Ansari.avif';

import usmanAliPng from '../../assets/images/our team/Usman Ali.png';
import usmanAliWebp from '../../assets/images/our team/Usman Ali.webp';
import usmanAliAvif from '../../assets/images/our team/Usman Ali.avif';

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
      'Integrity is the alignment of knowledge & wisdom. Every asset, lesson & concept we publish is the result of intensive research & precise execution. We operate with the understanding that credibility is built on consistent & uncompromising truth.',
  },
  {
    title: 'Community',
    description:
      'True learning is a shared pursuit. We curate environments where individuals do not merely study in parallel—they evolve in community. At Gorythm, you are recognized by your unique perspective, your distinct journey & the vital purpose you bring to the collective space.',
  },
  {
    title: 'Excellence',
    description:
      'From the way we build our courses to the way we support our students, we refuse to settle for "good enough." We are committed to constant improvement—not for the applause, but because our mission demands it & our community deserves it.',
  },
  {
    title: 'Faith',
    description:
      'Gorythm prioritizes timeless truths over changing trends. Faith is not a separate piece of what we do—it is the core reality of who we are. It is the uncompromised foundation from which every program, insight & framework we offer is built.',
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
    name: 'Sufiyan Nadeem',
    role: 'CEO, Earth movers International',
    country: 'United Arab Emirates',
    raster: { avif: sufiyanAvif, webp: sufiyanWebp, png: sufiyanPng },
  },
  {
    name: 'Gülsen Yazici',
    role: 'Psychosocial Systems and Gestalt Therapist',
    country: 'Netherlands',
    raster: { avif: gulsenAvif, webp: gulsenWebp, png: gulsenPng },
  },
  {
    name: 'Ahmed Bin Rashid',
    role: 'Graphics Designer and Poet',
    country: 'Pakistan',
    raster: { avif: ahmedAvif, webp: ahmedWebp, png: ahmedPng },
  },
  {
    name: 'Fatima Rashid',
    role: 'Communications Specialist, Gorythm',
    country: 'Pakistan',
    raster: { avif: fatimaAvif, webp: fatimaWebp, png: fatimaPng },
  },
  {
    name: 'Muhammad Munim Ansari',
    role: 'Administrator, Gorythm',
    country: 'Pakistan',
    raster: { avif: muhammadMunimAnsariAvif, webp: muhammadMunimAnsariWebp, png: muhammadMunimAnsariPng },
  },
  {
    name: 'Usman Ali',
    role: 'Human Resource, Gorythm',
    country: 'Pakistan',
    raster: { avif: usmanAliAvif, webp: usmanAliWebp, png: usmanAliPng },
  },
  {
    name: 'Syed Shahmeer Ahmed',
    role: 'Accounts, Gorythm',
    country: 'Pakistan',
    raster: { avif: shahmeerAvif, webp: shahmeerWebp, png: shahmeerPng },
  },
  {
    name: 'Farhan Gondal',
    role: 'IT Consultant',
    country: 'Pakistan',
    raster: { avif: farhanAvif, webp: farhanWebp, png: farhanPng },
  },
  {
    name: 'Syed Kamran Ahmad',
    role: 'Systems Engineering Manager',
    country: 'Saudi Arabia',
    raster: { avif: kamranAvif, webp: kamranWebp, png: kamranPng },
  },
];

const academyHighlights = [
  {
    title: 'Our Mission',
    description:
      'To make rigorous & meaningful education accessible to all. By strengthening the intellectual, emotional & physical foundations of our learners, we empower them to live with purpose & clarity.',
    raster: { avif: academyMissionAvif, webp: academyMissionWebp, png: academyMissionPng },
  },
  {
    title: 'Our Vision',
    description:
      'To be a global platform for human development—a place where research, character & knowledge meet, & where faith guides everything we teach. We exist to empower people to discover who they are, understand their purpose & live it out with intention.',
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
            </div>

            <div className="about-page-dark__intro-copy">
              <h2>Four principles behind every program</h2>
              <p>
              Everything you learn at Gorythm is well-researched, developed, reviewed & carefully structured to deliver clear & defined concepts.
              </p>
              <ul className="about-page-dark__intro-points">
                <li>
                  <strong>Concepts First:</strong> We teach the principle before the process. Our curriculum is built to develop understanding, not memorisation.
                </li>
                <li>
                  <strong>Interactive Sessions:</strong> Every session is a conversation. Our content is designed to create a space for reflection, dialogue & focused engagement.
                </li>
                <li>
                  <strong>Led by Values:</strong> Each lesson connects to real life. Our material is written to build judgement, not just to deliver answers.
                </li>
                <li>
                  <strong>Personality Development:</strong> Academic progress is only a small part of the journey. Our courses are designed to nurture confidence, discipline, self-awareness & the skills needed for lifelong growth.
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
                  Gorythm began with a single, unshakeable conviction: education was never meant to be mere content delivery. It was always meant to be transformation.
                </p>
                <p>
                  We kept witnessing the exact same modern symptom—students who knew more but understood less; individuals who could absorb information but could not reflect; & knowledge that accumulated in the mind but never deepened into wisdom, character or faith.
                </p>
                <p>
                  Gorythm was built to fix that exact detachment.
                </p>
                <p>
                  The ultimate goal was never to discard knowledge, but to challenge the illusions of what we think is correct.
                </p>
                <p>
                  We believe that human beings were created with inherent depth across all dimensions. To neglect any single dimension is to compromise the whole; but bringing them into alignment is what unlocks the true capability.
                </p>
                <p>
                  Our curriculum & experiences are engineered for precise outcomes such as building self-awareness, securing your faith & empowering you to live with absolute clarity in an increasingly fragmented world.
                </p>
                <p>
                  That is what Gorythm is here for.
                </p>
              </div>
            </div>

            
          </section>

          <section className="about-page-dark__values">
            <span className="about-page-dark__eyebrow">Our core values</span>
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

      <VideoSection placement="about" />

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
