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
    title="Qur'an-Centered Learning"
    description="Every course is built to help learners strengthen their relationship with the Qur'an through recitation, understanding, and reflection. We focus on meaningful progress so learners can apply Islamic guidance in everyday life with confidence."
    points={[
      'Step-by-step recitation with Tajweed and personalized feedback',
      'Concept-based lessons that build understanding, not memorization only',
      'Interactive sessions that connect learning to daily practice and character',
      'A consistent learning path for kids, teens, and adults at all levels',
    ]}
  />
);

// Page 2 – Exploration Missions
export const ExplorationMissionsPage = () => (
  <MissionPageLayout
    subtitle="How We Support Growth"
    title="Character That Grows With Knowledge"
    description="At GoRythm, education is not limited to academics. We nurture emotional awareness, discipline, leadership, and empathy through Islamic teachings so learners grow in both mindset and manners."
    points={[
      'Life skills and communication rooted in Islamic values',
      'Practical reflection through real-life scenarios and guided discussion',
      'Focus on sincerity, consistency, and excellence in learning habits',
      'A supportive environment that helps learners build confidence and akhlaq',
    ]}
  />
);

// Page 3 – Research and Observation
export const ResearchObservationPage = () => (
  <MissionPageLayout
    subtitle="How We Support Growth"
    title="Flexible Learning for Modern Families"
    description="Our online model combines qualified teachers, structured curriculum, and flexible scheduling so families can stay consistent in Islamic learning from anywhere in the world."
    points={[
      'Live online classes designed for convenience without compromising quality',
      'Structured courses in Qur\'an, Arabic, and Islamic studies',
      'Guided progress tracking and regular support from teachers',
      'A faith-centered journey that builds knowledge, confidence, and purpose',
    ]}
  />
);
