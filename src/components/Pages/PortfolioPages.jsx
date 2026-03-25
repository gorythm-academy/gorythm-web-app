// Individual portfolio item pages – one route per image/project
// Uses the shared portfolioItems data from PortfolioSection so content is always in sync

import React from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { portfolioItems } from '../HomeSections/Courses';
import './PortfolioPages.scss';

// ── Single item detail page ───────────────────────────────────────────────────
export const PortfolioItemPage = () => {
  const { slug } = useParams();
  const item = portfolioItems.find((p) => p.slug === slug);

  // Unknown slug → redirect home
  if (!item) return <Navigate to="/" replace />;

  // Next / Prev navigation
  const idx   = portfolioItems.indexOf(item);
  const prev  = portfolioItems[idx - 1] ?? null;
  const next  = portfolioItems[idx + 1] ?? null;

  return (
    <div className="portfolio-item-page scheme_dark">
      {/* Hero image */}
      <div className="pip-hero">
        <img src={item.image} alt={item.title} loading="lazy" width={1200} height={600} sizes="100vw" />
        <div className="pip-hero-overlay" />
        <div className="pip-hero-text">
          <span className="pip-category">{item.category}</span>
          <h1 className="pip-title">{item.title}</h1>
        </div>
      </div>

      {/* Content block */}
      <div className="pip-body">
        <p className="pip-description">{item.description}</p>

        {/* Prev / Next navigation */}
        <nav className="pip-nav">
          {prev ? (
            <Link to={`/portfolio/${prev.slug}`} className="pip-nav-link pip-nav-prev">
              <span className="pip-nav-arrow">←</span>
              <span className="pip-nav-label">{prev.title}</span>
            </Link>
          ) : <span />}

          {next && (
            <Link to={`/portfolio/${next.slug}`} className="pip-nav-link pip-nav-next">
              <span className="pip-nav-label">{next.title}</span>
              <span className="pip-nav-arrow">→</span>
            </Link>
          )}
        </nav>

        {/* Back to portfolio */}
        <div className="pip-back">
          <Link to="/portfolio" className="pip-back-link">
            <span>←</span> Back to Portfolio
          </Link>
        </div>
      </div>
    </div>
  );
};

// ── Portfolio index page ──────────────────────────────────────────────────────
export const PortfolioPage = () => (
  <div className="portfolio-index-page scheme_dark">
    <div className="portfolio-index-inner">
      <div className="portfolio-index-header">
        <span className="portfolio-index-eyebrow">All Work</span>
        <h1 className="portfolio-index-title">Portfolio</h1>
      </div>

      <div className="portfolio-index-grid">
        {portfolioItems.map((item) => (
          <Link
            key={item.id}
            to={`/portfolio/${item.slug}`}
            className="portfolio-index-card"
          >
            <div className="portfolio-index-img-wrap">
              <img src={item.image} alt={item.title} loading="lazy" width={400} height={250} sizes="(min-width: 768px) 50vw, 100vw" />
            </div>
            <div className="portfolio-index-caption">
              <span className="portfolio-index-card-title">{item.title}</span>
              <span className="portfolio-index-card-category">{item.category}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  </div>
);
