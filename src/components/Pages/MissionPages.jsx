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
    subtitle="Our Mission"
    title="Satellite Maintenance"
    description="We ensure the continued operation of critical satellite infrastructure through precise remote diagnostics, orbital adjustments, and advanced maintenance protocols."
    points={[
      'Remote diagnostics and anomaly detection',
      'Orbital altitude and attitude corrections',
      'On-orbit servicing and component upgrades',
      'End-of-life deorbit management',
    ]}
  />
);

// Page 2 – Exploration Missions
export const ExplorationMissionsPage = () => (
  <MissionPageLayout
    subtitle="Our Mission"
    title="Exploration Missions"
    description="Our exploration missions push the frontier of human knowledge, venturing into uncharted territories of our solar system and beyond with robotic and crewed spacecraft."
    points={[
      'Robotic planetary surface exploration',
      'Deep-space probe trajectory design',
      'Crewed mission life-support systems',
      'Scientific payload development and deployment',
    ]}
  />
);

// Page 3 – Research and Observation
export const ResearchObservationPage = () => (
  <MissionPageLayout
    subtitle="Our Mission"
    title="Research and Observation"
    description="Leveraging state-of-the-art observatories and ground-based arrays, our research team monitors, analyses, and publishes findings on cosmic phenomena across the electromagnetic spectrum."
    points={[
      'Multi-spectrum astronomical observation',
      'Space weather monitoring and forecasting',
      'Exoplanet detection and characterisation',
      'Data sharing with global research institutions',
    ]}
  />
);
