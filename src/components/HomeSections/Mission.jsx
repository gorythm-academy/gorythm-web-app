// Mission Section – 3 bare SVG shapes on black, no borders/backgrounds/overlays

import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './Mission.scss';

const missionCards = [
  {
    id: 1,
    bgSvg: 'https://stargaze.themerex.net/wp-content/uploads/2023/11/new-space-inverse-1.svg',
    title: "Qur'an-Centered Learning",
    description: "Every course is designed to help learners build a stronger relationship with the Qur'an through recitation, understanding, reflection, and consistent practice in daily life.",
    path: '/mission/satellite-maintenance',
  },
  {
    id: 2,
    bgSvg: 'https://stargaze.themerex.net/wp-content/uploads/2023/11/new-space-inverse-2.svg',
    title: 'Character That Grows With Knowledge',
    description: 'We believe meaningful education should shape both the mind and the heart. Our learning approach encourages discipline, sincerity, confidence, respect, and strong Islamic character.',
    path: '/mission/exploration-missions',
  },
  {
    id: 3,
    bgSvg: 'https://stargaze.themerex.net/wp-content/uploads/2023/11/new-space-inverse-3.svg',
    title: 'Flexible Learning for Modern Families',
    description: 'With interactive online classes, supportive teachers, and structured guidance, GoRythm makes it easier for kids, teens, and adults to learn from anywhere without losing quality or connection.',
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
