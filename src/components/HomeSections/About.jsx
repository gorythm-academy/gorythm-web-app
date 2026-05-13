// About Section Component – Stargaze-style layout

import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import OptimizedPicture from '../OptimizedPicture/OptimizedPicture';
import './About.scss';

import aboutLeftPng from '../../assets/images/home/about-left.png';
import aboutLeftWebp from '../../assets/images/home/about-left.webp';
import aboutLeftAvif from '../../assets/images/home/about-left.avif';

import aboutRightPng from '../../assets/images/home/about-right.png';
import aboutRightWebp from '../../assets/images/home/about-right.webp';
import aboutRightAvif from '../../assets/images/home/about-right.avif';

const AboutSection = () => {
  const navigate = useNavigate();
  const sectionRef = useRef(null);
  const paragraphRef = useRef(null);
  const [isInView, setIsInView] = useState(false);
  const [paragraphInView, setParagraphInView] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsInView(true);
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Paragraph animates only when it enters the viewport (not with the section)
  useEffect(() => {
    const el = paragraphRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setParagraphInView(true);
      },
      { threshold: 0.2, rootMargin: '0px 0px -30px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sectionData = {
    sectionNumber: '02',
    label: 'About Gorythm',
    title: 'Knowledge Connected To Identity',
    paragraph:
      `Gorythm connects every domain of knowledge into one coherent pursuit of understanding grounded in a single conviction: that truth is coherent, self-knowledge is the root of real growth, and the signs pointing toward both are already within you. Our courses develop the whole person. Thought. Character. Purpose`,

  };

  const inviewClass = isInView ? 'about-inview' : '';
  const paragraphInviewClass = paragraphInView ? 'about-paragraph-inview' : '';

  return (
    <section
      ref={sectionRef}
      className={`front_page_section front_page_section_about scheme_dark ${inviewClass}`}
      role="link"
      tabIndex={0}
      aria-label="About Gorythm. Open About Us page."
      onClick={() => navigate('/about')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') navigate('/about');
      }}
    >
      <div className="front_page_section_inner front_page_section_about_inner">
        <div className="about_content_wrap">
          {/* Large "02" behind heading – gradient, decorative */}
          <span className="about_big_number about_anim" aria-hidden="true">
            {sectionData.sectionNumber}
          </span>

          <div className="about_layout">
            <div className="about_left">
              <p className="about_label about_anim">{sectionData.label}</p>
              <h2 className="about_title about_anim">{sectionData.title}</h2>
              <div className="about_image_wrap about_image_left about_anim">
                <OptimizedPicture
                  avifSrc={aboutLeftAvif}
                  webpSrc={aboutLeftWebp}
                  fallbackSrc={aboutLeftPng}
                  alt=""
                  loading="lazy"
                  width={400}
                  height={300}
                />
              </div>
            </div>
            <div className="about_right">
              <div className="about_image_wrap about_image_right about_anim">
                <OptimizedPicture
                  avifSrc={aboutRightAvif}
                  webpSrc={aboutRightWebp}
                  fallbackSrc={aboutRightPng}
                  alt=""
                  loading="lazy"
                  width={400}
                  height={300}
                />
              </div>
              <p
                ref={paragraphRef}
                className={`about_paragraph about_anim ${paragraphInviewClass}`}
              >
                {sectionData.paragraph}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
