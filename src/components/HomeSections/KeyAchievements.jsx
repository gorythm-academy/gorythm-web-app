// Key Achievements Section – two columns: left = staggered images with + and popup; right = 03, eyebrow, title, description, View All Projects

import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './KeyAchievements.scss';

// Key Achievement images from src/assets/images – rename paths if your files differ (e.g. milestone-img01.jpg)
import milestoneImg01 from '../../assets/images/milestone-img01.jpg';
import milestoneImg02 from '../../assets/images/milestone-img02.jpg';

const achievementsImages = [
  {
    id: 1,
    image: milestoneImg01,
    title: 'Human Spaceflight',
    description: 'Astronauts in orbit — a symbol of human ambition and international cooperation in space.',
  },
  {
    id: 2,
    image: milestoneImg02,
    title: 'Planetary Exploration',
    description: 'Rovers and landers on distant worlds, expanding our understanding of the solar system.',
  },
];

const KeyAchievementsSection = () => {
  const sectionRef = useRef(null);
  const [isInView, setIsInView] = useState(false);
  const [popupId, setPopupId] = useState(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsInView(true); },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`key-achievements-section scheme_dark${isInView ? ' key-achievements-inview' : ''}`}
    >
      <div className="key-achievements-inner">
        {/* Left – two staggered images with + and hover popup */}
        <div className="key-achievements-left">
          <div className="key-achievements-images">
            {achievementsImages.map((item, idx) => (
              <div
                key={item.id}
                className={`key-achievements-img-wrap key-achievements-img-${idx + 1}${popupId === item.id ? ' img-wrap--popup-open' : ''}`}
              >
                <div className="key-achievements-img-inner">
                  <img src={item.image} alt={item.title} loading="lazy" width={300} height={200} sizes="(min-width: 768px) 300px, 100vw" />
                </div>
                <button
                  type="button"
                  className="key-achievements-plus"
                  aria-label={`Learn more about ${item.title}`}
                  onMouseEnter={() => setPopupId(item.id)}
                  onMouseLeave={() => setPopupId(null)}
                  onClick={() => setPopupId(popupId === item.id ? null : item.id)}
                >
                  <span className="key-achievements-plus-icon" aria-hidden="true">+</span>
                </button>
                {popupId === item.id && (
                  <div
                    className="key-achievements-popup"
                    onMouseEnter={() => setPopupId(item.id)}
                    onMouseLeave={() => setPopupId(null)}
                  >
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right – 03, eyebrow, title, description, button */}
        <div className="key-achievements-right">
          <span className="key-achievements-big-number key_anim" aria-hidden="true">03</span>
          <div className="key-achievements-content">
            <p className="key-achievements-eyebrow key_anim">Key achievements</p>
            <h2 className="key-achievements-title key_anim">
              Our milestones in space exploration
            </h2>
            <p className="key-achievements-description key_anim">
              Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium
              doloremque laudantium.
            </p>
            <Link to="/portfolio" className="key-achievements-cta key_anim">
              View All Projects
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default KeyAchievementsSection;
