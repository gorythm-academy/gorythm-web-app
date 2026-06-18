// Mission detail pages – one component per mission card (Satellite, Exploration, Research)

import React from 'react';
import { Link } from 'react-router-dom';
import './MissionPages.scss';

// Ring order: PhQ → IQ → EQ → PhQ (paths match Mission.jsx cards)
const MISSION_RING = [
  { key: 'phq', label: 'Physical Health Quotient', path: '/mission/research-and-observation' },
  { key: 'iq', label: 'Intellectual Quotient', path: '/mission/satellite-maintenance' },
  { key: 'eq', label: 'Emotional Quotient', path: '/mission/exploration-missions' },
];

const getRingNeighbors = (currentKey) => {
  const index = MISSION_RING.findIndex((item) => item.key === currentKey);
  if (index < 0) return { prev: null, next: null };
  const len = MISSION_RING.length;
  return {
    prev: MISSION_RING[(index - 1 + len) % len],
    next: MISSION_RING[(index + 1) % len],
  };
};

const MissionRingNav = ({ currentKey }) => {
  const { prev, next } = getRingNeighbors(currentKey);
  if (!prev || !next) return null;

  return (
    <nav className="mission-ring-nav" aria-label="Other mission sections">
      <Link
        to={prev.path}
        className="mission-ring-nav-link mission-ring-nav-link--prev"
        aria-label={`Previous section: ${prev.label}`}
      >
        <span className="mission-ring-nav-arrow" aria-hidden="true">←</span>
        <span className="mission-ring-nav-label">{prev.label}</span>
      </Link>
      <Link
        to={next.path}
        className="mission-ring-nav-link mission-ring-nav-link--next"
        aria-label={`Next section: ${next.label}`}
      >
        <span className="mission-ring-nav-label">{next.label}</span>
        <span className="mission-ring-nav-arrow" aria-hidden="true">→</span>
      </Link>
    </nav>
  );
};

// Shared layout for all mission pages
const MissionPageLayout = ({ ringKey, title, subtitle, description, points }) => (
  <div className="mission-page scheme_dark">
    <div className="mission-page-inner">
      <div className="mission-page-header">
        <span className="mission-page-subtitle">{subtitle}</span>
        <h1 className="mission-page-title">{title}</h1>
      </div>
      <div className="mission-page-body">
        <p className="mission-page-description">{description}</p>
        {points && (
          <ul className="mission-page-points">
            {points.map((pt, i) => (
              <li key={i}>{pt}</li>
            ))}
          </ul>
        )}
      </div>
      <MissionRingNav currentKey={ringKey} />
      <div className="mission-page-cta-row">
        <Link to="/courses" className="mission-page-cta" aria-label="Explore all courses">
          <span className="mission-page-cta-text">Explore all courses</span>
          <span className="mission-page-cta-arrow" aria-hidden="true">→</span>
        </Link>
      </div>
      <div className="mission-page-back">
        <Link to="/" className="mission-back-link">
          <span className="mission-back-arrow">←</span> Back to Home
        </Link>
      </div>
    </div>
  </div>
);

// Page 1 – Satellite Maintenance
export const SatelliteMaintenancePage = () => (
  <MissionPageLayout
    ringKey="iq"
    subtitle="How We Support Growth"
    title="IQ — Intellectual Quotient: How you think, learn, and grow"
    description="Intelligence is not what you know, it is how you engage with what you do not know yet. We develop intellectual creativity, critical thinking, logical reasoning, pattern recognition, and the capacity to learn independently. We build curiosity, adaptability of thought, and the courage to question what you think you know. Real intelligence is not fixed. It is forged."
    points={[
      'Critical Thinking: Analyze deeply before deciding. Examine your assumptions & arrive at conclusions that truly hold up, rather than settling for what simply feels right.',
      'Pattern Recognition: See connections others miss across various disciplines & contexts. The mind that finds structure in complexity is the mind that leads.',
      'Independent Learning: Take absolute command of your personal evolution. The capacity to self-direct your learning is the ultimate competitive advantage in a changing world.',
      'Adaptability of Thought: Revise your beliefs when evidence calls for it. Hold ideas firmly enough to defend them, but loosely enough to release them when necessary. That tension is the mark of a developed intellect.',
    ]}
  />
);

// Page 2 – Exploration Missions
export const ExplorationMissionsPage = () => (
  <MissionPageLayout
    ringKey="eq"
    subtitle="How We Support Growth"
    title="EQ — Emotional Quotient: How you feel, connect, and lead."
    description="Emotional intelligence is not softness. It is precision. We develop self-awareness, empathy, emotional regulation & the ability to act with clarity under pressure. Our approach is grounded in resilience, moral integrity & a sense of purpose that holds steady when circumstances do not. Character is not built in comfort. It is built in the moments that test it."
    points={[
      'Self-Awareness: Know your triggers, patterns & emotional landscape. The person who truly understands himself is rarely controlled by circumstances.',
      'Empathy: Hold space for others without losing your own centre. Empathy is not agreement — it is presence, without losing yourself in the process.',
      'Clarity Under Pressure: Respond rather than react when things get hard. Staying clear when everything pulls toward panic is one of the highest forms of emotional strength.',
      'Moral Integrity: Stay aligned with your values, especially when no one is watching. Consistency between belief & behavior is the foundation of a trustworthy character.',
    ]}
  />
);

// Page 3 – Research and Observation
export const ResearchObservationPage = () => (
  <MissionPageLayout
    ringKey="phq"
    subtitle="How We Support Growth"
    title="PhQ — Physical Health Quotient"
    description="How we move, recover & endure. Our body is not separate from our mind; rather it is the foundation of it. We practice discipline, vitality & daily habits necessary to fuel our highest ambitions over the long run. True physical health is rooted in somatic awareness, strategic recovery & a deep understanding of how our physical state dictates our mental & emotional resilience. The body is a vessel. We should treat it with ultimate respect."
    points={[
      'Discipline & Vitality: Practice habits that maximize our energy, not just our appearance. True power comes from consistency over intensity.',
      'Somatic Awareness: Listen to the subtle signals our body sends before they become disasters. Awareness is the prerequisite for transformation.',
      'Strategic Recovery: Rest is not a luxury, nor is it laziness. It is the active & non-negotiable foundation of high performance.',
      'The Mind-Body Synergy: Our physical state directly governs our mental clarity. How we carry our body ultimately dictates how we carry our life.',
    ]}
  />
);
