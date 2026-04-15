// MarqueeSection – large continuously scrolling text ticker (right-to-left)
// Text: "EXPANDING HUMAN HORIZON." on a black background

import React from 'react';
import './Marquee.scss';

// Text is duplicated inside the track so the loop is seamless
// Change the string below to update the marquee text
const MARQUEE_TEXT = 'Learn, Grow and Connect with Islam from Anywhere';
// Number of repetitions per track half (more = smoother at larger screens)
const REPEAT = 6;

const MarqueeSection = () => {
  const items = Array.from({ length: REPEAT }, (_, i) => (
    <span key={i} className="marquee-item">
      {MARQUEE_TEXT}
      <span className="marquee-dot" aria-hidden="true">·</span>
    </span>
  ));

  return (
    <div className="marquee-section" aria-hidden="true">
      {/* Two identical tracks: first plays 0→-50%, second is offset so the
          seam is never visible – CSS handles this via animationDelay */}
      <div className="marquee-track">
        {/* Full set duplicated so translateX(-50%) brings you back to start */}
        {items}
        {items}
      </div>
    </div>
  );
};

export default MarqueeSection;
