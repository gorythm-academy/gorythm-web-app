// Mission detail pages – one component per mission card (Satellite, Exploration, Research)

import React from 'react';
import { Link } from 'react-router-dom';
import './MissionPages.scss';

// Shared layout for all mission pages
const MissionPageLayout = ({ title, subtitle, description, points }) => (
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
    subtitle="How We Support Growth"
    title="IQ — Intellectual Quotient: How you think, learn, and grow"
    description="Intelligence is not what you know, it is how you engage with what you do not know yet. We develop intellectual creativity, critical thinking, logical reasoning, pattern recognition, and the capacity to learn independently. We build curiosity, adaptability of thought, and the courage to question what you think you know. Real intelligence is not fixed. It is forged."
    points={[
      'Critical Thinking: Analyse deeply before deciding. Examine assumptions and arrive at conclusions that hold, not just ones that feel right.',
      'Pattern Recognition: See connections others miss across disciplines and contexts. The mind that finds structure in complexity is the mind that leads.',
      'Independent Learning: Take ownership of your growth. The ability to direct your own learning is one of the rarest things education can build.',
      'Adaptability of Thought: Revise beliefs when evidence calls for it. Hold ideas firmly enough to defend them, loosely enough to release them. That tension is the mark of a developed intellect. The mind that thinks well, learns well. The mind that learns well, lives well.',
    ]}
  />
);

// Page 2 – Exploration Missions
export const ExplorationMissionsPage = () => (
  <MissionPageLayout
    subtitle="How We Support Growth"
    title="EQ — Emotional Quotient: How you feel, connect, and lead."
    description="At GoRythm, education is not limited to academics. We nurture emotional awareness, discipline, leadership, and empathy through Islamic teachings so learners grow in both mindset and manners."
    points={[
      'Emotional intelligence is not softness; it is precision. We develop self-awareness, empathy, emotional regulation, and the ability to act with clarity under pressure. Deepened by resilience in adversity, moral integrity, and the inner sense of purpose that keeps you grounded when circumstances are not. Character is not built in comfort. It is built in the moments that test it.',
      'Self-Awareness: Know your triggers, patterns, and emotional landscape honestly. The person who understands themselves is rarely controlled by circumstances. Empathy Hold space for others without losing your own centre. Real empathy is not agreement — it is presence, without losing yourself in it.',
      'Clarity Under Pressure: Respond rather than react when things get hard. The ability to stay clear when everything pulls toward panic is one of the highest forms of emotional strength. Moral Integrity Act in alignment with your values, especially when no one is watching. Consistency between belief and behavior is the foundation of a trustworthy character. The person who knows themselves leads others. The person who leads with character changes them.',
      'A supportive environment that helps learners build confidence and akhlaq',
    ]}
  />
);

// Page 3 – Research and Observation
export const ResearchObservationPage = () => (
  <MissionPageLayout
    subtitle="How We Support Growth"
    title="PhQ — Physical Health Quotient: How you move, recover, and sustain."
    description="Our online model combines qualified teachers, structured curriculum, and flexible scheduling so families can stay consistent in Islamic learning from anywhere in the world."
    points={[
      'The body is not separate from the mind; it is the condition of it. We develop discipline, vitality, and the habits that sustain the energy to pursue meaningful goals over time. Extended by body awareness, rest as a practice, and a deep understanding of how physical state shapes mental performance and emotional resilience. The body is a trust. We treat it accordingly. Discipline & Vitality Build movement habits that serve your energy, not just your appearance. Consistency over intensity every time.',
      'Body Awareness: Listen to what your body is telling you before it starts shouting. Awareness precedes every meaningful physical change.',
      'Rest as a Practice Recovery is not laziness; it is the foundation of sustained performance. The person who rests well works well.',
      'Body-Mind Connection: Your physical state directly shapes your mental clarity and emotional resilience. How you carry your body determines, in part, how you carry everything else. Think with depth. Feel with clarity. Live with discipline.',
        ]}
  />
);
