// Mission Section – 3 bare SVG shapes on black, no borders/backgrounds/overlays

import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './Mission.scss';

const missionCards = [
  {
    id: 1,
    bgSvg: 'https://stargaze.themerex.net/wp-content/uploads/2023/11/new-space-inverse-1.svg',
    subtitle: 'Our mission',
    title: 'STEM With An Islamic Perspective',
    description: 'Our STEM Education program blends Science, Technology, Engineering, & Mathematics with Islamic principles. It enables students to discover innovation through faith, strengthening problem-solving, creativity, & curiosity while understanding how modern knowledge connects with the wisdom of the Qur’an in life.',
    path: '/mission/satellite-maintenance',
  },
  {
    id: 2,
    bgSvg: 'https://stargaze.themerex.net/wp-content/uploads/2023/11/new-space-inverse-2.svg',
    subtitle: 'Our mission',
    title: 'Life Skills, Character Development',
    description: 'This program highlights emotional growth, communication, leadership & empathy, all based on Islamic teachings. Through engaging lessons & real-life experiences, students learn to overcome challenges, control emotions, & build strong moral character that reflects the Prophetic way in everyday life.',
    path: '/mission/exploration-missions',
  },
  {
    id: 3,
    bgSvg: 'https://stargaze.themerex.net/wp-content/uploads/2023/11/new-space-inverse-3.svg',
    subtitle: 'Our mission',
    title: 'Learn, Grow & Connect Spiritually',
    description: 'At Go Rythm, we provide engaging and highly interactive online Islamic courses for kids, teens, and adults worldwide. Our mission is to nurture knowledge alongside strong character, enabling every learner to grow spiritually and intellectually while staying aligned with core Islamic values in everyday life and personal development.',
    path: '/mission/research-and-observation',
  },
];

const MissionSection = () => {
  const sectionRef = useRef(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsInView(true); },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`mission-section${isInView ? ' mission-inview' : ''}`}
    >
      <div className="mission-inner">
        <div className="mission-cards">
          {missionCards.map((card, idx) => (
            <Link
              key={card.id}
              to={card.path}
              className={`mission-card mission-card-anim mission-card-delay-${idx}`}
              aria-label={`Go to ${card.title}`}
            >
              {/* Shape only – no extra overlays, no background panel */}
              <div className="mission-card-thumb">
                <img
                  src={card.bgSvg}
                  alt={card.title}
                  className="mission-shape-img"
                  draggable="false"
                  loading="lazy"
                  width={320}
                  height={200}
                />
              </div>

              {/* Text info */}
              <div className="mission-card-info">
                <span className="mission-card-subtitle">{card.subtitle}</span>
                <h4 className="mission-card-title">{card.title}</h4>
                <p className="mission-card-description">{card.description}</p>
                <div className="mission-card-arrow">
                  <span className="mission-arrow-icon" aria-hidden="true">→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default MissionSection;
