import React, { useState } from 'react';
import './ResearchSeriesView.scss';

const ResearchSeriesView = ({ seriesData }) => {
  const topics = seriesData?.topics || [];
  const [openTopic, setOpenTopic] = useState(topics[0]?.number ?? 1);

  if (!topics.length) {
    return <p className="research-series-empty">No series data available.</p>;
  }

  return (
    <div className="research-series">
      <p className="research-series-intro">
        Eight events from the life of Ibrahim (AS). Tap + to expand each section and read the event descriptions with Qur&apos;an references.
      </p>

      <div className="research-series-topics">
        {topics.map((topic) => {
          const isOpen = openTopic === topic.number;
          const eventsText = topic.events || topic.theme || '';

          return (
            <section
              key={topic.number}
              className={`research-series-topic${isOpen ? ' research-series-topic--open' : ''}`}
            >
              <button
                type="button"
                className="research-series-topic__toggle"
                aria-expanded={isOpen}
                onClick={() => setOpenTopic(isOpen ? null : topic.number)}
              >
                <span className="research-series-topic__number">{topic.number}</span>
                <span className="research-series-topic__title-wrap">
                  <span className="research-series-topic__title">{topic.title}</span>
                  {eventsText ? (
                    <span className="research-series-topic__events">{eventsText}</span>
                  ) : null}
                </span>
                <span className="research-series-topic__chevron" aria-hidden="true">
                  {isOpen ? '−' : '+'}
                </span>
              </button>

              {isOpen ? (
                <div className="research-series-topic__body">
                  {topic.modernRelevance ? (
                    <div className="research-series-relevance">
                      <span className="research-series-label">Modern relevance</span>
                      <p>{topic.modernRelevance}</p>
                    </div>
                  ) : null}

                  <div className="research-series-points">
                    {topic.points.map((point, idx) => (
                      <article key={`${topic.number}-${idx}`} className="research-series-point">
                        <p className="research-series-point__label">{point.label}</p>

                        <h4 className="research-series-point__section-title">Event description</h4>
                        <p className="research-series-point__text">{point.mainPoint}</p>

                        <h4 className="research-series-point__section-title">Quran Reference</h4>
                        <p className="research-series-point__quran">{point.quranicAnchor}</p>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default ResearchSeriesView;
