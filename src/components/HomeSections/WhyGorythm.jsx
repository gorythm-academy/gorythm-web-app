// Why Choose GoRythm section – two columns: left = staggered images with + and popup; right = 03, eyebrow, title, description, CTA

import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import OptimizedPicture from '../OptimizedPicture/OptimizedPicture';
import './WhyGorythm.scss';

import whyLeftPng from '../../assets/images/home/why-choose-left.png';
import whyLeftWebp from '../../assets/images/home/why-choose-left.webp';
import whyLeftAvif from '../../assets/images/home/why-choose-left.avif';

import whyRightPng from '../../assets/images/home/why-choose-right.png';
import whyRightWebp from '../../assets/images/home/why-choose-right.webp';
import whyRightAvif from '../../assets/images/home/why-choose-right.avif';

const whyGorythmImages = [
  {
    id: 1,
    raster: { avif: whyLeftAvif, webp: whyLeftWebp, png: whyLeftPng },
    title: 'Guided by Qualified Teachers',
    description:
      'Learn with caring instructors who combine authentic Islamic knowledge with clear, student-friendly teaching.',
  },
  {
    id: 2,
    raster: { avif: whyRightAvif, webp: whyRightWebp, png: whyRightPng },
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
      className={`why-gorythm-section scheme_dark${isInView ? ' why-gorythm-inview' : ''}`}
    >
      <div className="why-gorythm-inner">
        {/* Left – two staggered images with + and hover popup */}
        <div className="why-gorythm-left">
          <div className="why-gorythm-images">
            {whyGorythmImages.map((item, idx) => (
              <div
                key={item.id}
                className={`why-gorythm-img-wrap why-gorythm-img-${idx + 1}${popupId === item.id ? ' why-gorythm-img-wrap--popup-open' : ''}`}
              >
                <div className="why-gorythm-img-inner">
                  <OptimizedPicture
                    avifSrc={item.raster.avif}
                    webpSrc={item.raster.webp}
                    fallbackSrc={item.raster.png}
                    alt={item.title}
                    loading="lazy"
                    width={300}
                    height={200}
                    sizes="(min-width: 768px) 300px, 100vw"
                  />
                </div>
                <button
                  type="button"
                  className="why-gorythm-plus"
                  aria-label={`Learn more about ${item.title}`}
                  onMouseEnter={() => setPopupId(item.id)}
                  onMouseLeave={() => setPopupId(null)}
                  onClick={() => setPopupId(popupId === item.id ? null : item.id)}
                >
                  <span className="why-gorythm-plus-icon" aria-hidden="true">
                    +
                  </span>
                </button>
                {popupId === item.id && (
                  <div
                    className="why-gorythm-popup"
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
        <div className="why-gorythm-right">
          <span className="why-gorythm-big-number why-gorythm_anim" aria-hidden="true">
            03
          </span>
          <div className="why-gorythm-content">
            <p className="why-gorythm-eyebrow why-gorythm_anim">Why Choose GoRythm</p>
            <h2 className="why-gorythm-title why-gorythm_anim">
              A learning experience designed with purpose and care.
            </h2>
            <p className="why-gorythm-description why-gorythm_anim">
            Gorythm is not about adding information. It is about refining your capacity to use it. Our research is organic, each study connected to the next, forming a coherent picture of human development.
Qualified educators. Original research. A curriculum built around your intellect, your inner life, and your presence in the world. </p>
            <Link to="/contact" className="why-gorythm-cta why-gorythm_anim">
              Contact Us
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhyGorythmSection;

