// Why GoRythm Section – two columns: left = staggered images with + and popup; right = 03, eyebrow, title, description, CTA

import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './WhyGorythm.scss';

// Section images from src/assets/images
import milestoneImg01 from '../../assets/images/milestone-img01.jpg';
import milestoneImg02 from '../../assets/images/milestone-img02.jpg';

const achievementsImages = [
  {
    id: 1,
    image: milestoneImg01,
    title: 'Guided by Qualified Teachers',
    description:
      'Learn with caring instructors who combine authentic Islamic knowledge with clear, student-friendly teaching.',
  },
  {
    id: 2,
    image: milestoneImg02,
    title: 'Built for Real Growth',
    description:
      'Our lessons support progress in recitation, understanding, character, and daily practice, not just class attendance.',
  },
];

const WhyGorythmSection = () => {
  const sectionRef = useRef(null);
  const [isInView, setIsInView] = useState(false);
  const [popupId, setPopupId] = useState(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsInView(true);
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
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
                  <img
                    src={item.image}
                    alt={item.title}
                    loading="lazy"
                    width={300}
                    height={200}
                    sizes="(min-width: 768px) 300px, 100vw"
                  />
                </div>
                <button
                  type="button"
                  className="key-achievements-plus"
                  aria-label={`Learn more about ${item.title}`}
                  onMouseEnter={() => setPopupId(item.id)}
                  onMouseLeave={() => setPopupId(null)}
                  onClick={() => setPopupId(popupId === item.id ? null : item.id)}
                >
                  <span className="key-achievements-plus-icon" aria-hidden="true">
                    +
                  </span>
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
          <span className="key-achievements-big-number key_anim" aria-hidden="true">
            03
          </span>
          <div className="key-achievements-content">
            <p className="key-achievements-eyebrow key_anim">Why GoRythm</p>
            <h2 className="key-achievements-title key_anim">
              A meaningful learning journey, rooted in faith
            </h2>
            <p className="key-achievements-description key_anim">
              GoRythm helps learners build a strong connection with the Qur&apos;an, Arabic, and Islamic
              values through engaging online classes designed for real growth. Our focus is not only
              on knowledge, but on confidence, character, and a deeper sense of purpose.
            </p>
            <Link to="/contact" className="key-achievements-cta key_anim">
              Contact Us
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhyGorythmSection;

