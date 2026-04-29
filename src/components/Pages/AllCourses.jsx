import React, { useState } from 'react';
import './AllCourses.scss';
import CoursesSection from '../HomeSections/Courses';

const faqs = [
  {
    question: 'Who can enroll in GoRythm courses?',
    answer:
      'Our courses are designed for kids, teens, and adults of all levels. Whether you are a beginner or looking to improve your existing knowledge, we have structured programs to suit your needs.',
  },
  {
    question: 'Are the classes conducted online or in-person?',
    answer:
      'All our classes are conducted online, allowing learners to study from anywhere in the world with flexible scheduling and convenience.',
  },
  {
    question: 'Do I need prior knowledge to join a course?',
    answer:
      'No prior knowledge is required for most of our courses. We offer beginner-friendly options as well as advanced levels to ensure every learner can start comfortably.',
  },
  {
    question: 'How are the classes structured?',
    answer:
      'Classes are interactive and guided by qualified teachers. We focus on step-by-step learning, regular practice, and personalized feedback to ensure steady progress.',
  },
  {
    question: 'How can I enroll in a course?',
    answer:
      'You can enroll by contacting our team through Whatsapp or filling out the registration form. Our team will guide you through course selection, scheduling, and the onboarding process.',
  },
];

const AllCourses = () => {
  const [openFaqIndex, setOpenFaqIndex] = useState(0);

  return (
    <section className="courses-page scheme_dark">
      <div className="courses-page-header">
        <h1 className="courses-page-title">All Courses</h1>
        <span className="courses-page-arrow" aria-hidden="true" />
      </div>

      <CoursesSection ctaTo="/contact" ctaLabel="Contact Us" showMeta emptyStateMode="all-courses" />

      <section className="courses-faq" aria-label="Frequently asked questions">
        <div className="courses-faq-title-wrap">
          <h2 className="courses-faq-title">FAQs</h2>
          <span className="courses-page-arrow courses-faq-arrow" aria-hidden="true" />
        </div>

        <div className="courses-faq-list" role="list">
          {faqs.map((item, idx) => {
            const isOpen = openFaqIndex === idx;
            const panelId = `courses-faq-panel-${idx}`;
            const buttonId = `courses-faq-button-${idx}`;
            return (
              <div key={item.question} className="courses-faq-item" role="listitem">
                <button
                  type="button"
                  id={buttonId}
                  className="courses-faq-trigger"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenFaqIndex((prev) => (prev === idx ? -1 : idx))}
                >
                  <span className="courses-faq-question">{item.question}</span>
                  <span className="courses-faq-icon" aria-hidden="true">
                    {isOpen ? '−' : '+'}
                  </span>
                </button>

                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className={`courses-faq-panel${isOpen ? ' courses-faq-panel--open' : ''}`}
                >
                  <div className="courses-faq-answer">{item.answer}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </section>
  );
};

export default AllCourses;
