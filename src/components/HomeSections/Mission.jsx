// Mission Section – 3 bare SVG shapes on black, no borders/backgrounds/overlays

import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './Mission.scss';

const missionCards = [
  {
    id: 1,
    bgSvg: 'https://stargaze.themerex.net/wp-content/uploads/2023/11/new-space-inverse-1.svg',
    title: "IQ — Intellectual Quotient",
    description: "Intellectual Creativity, critical thinking, logical reasoning, pattern recognition, and the capacity to learn independently, Curiosity, adaptability of thought, and the courage to question what you think you know ",
    path: '/mission/satellite-maintenance',
  },
  {
    id: 2,
    bgSvg: 'https://stargaze.themerex.net/wp-content/uploads/2023/11/new-space-inverse-2.svg',
    title: 'EQ — Emotional Quotient',
    description: 'Emotional Self-awareness, empathy, emotional regulation, and the ability to act with clarity under pressure, Resilience in adversity, moral integrity, and the inner sense of purpose that guides your decisions',
    path: '/mission/exploration-missions',
  },
  {
    id: 3,
    bgSvg: 'https://stargaze.themerex.net/wp-content/uploads/2023/11/new-space-inverse-3.svg',
    title: 'PhQ — Physical  Quotient',
    description: 'Physical Discipline, vitality, and the habits that sustain the energy to pursue meaningful goals over time, Body awareness, rest as a practice, and the connection between physical state and mental performance',
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
