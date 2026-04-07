import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Native-scroll wrapper — no synthetic smooth-scroll library.
// Route changes scroll to top instantly; the browser handles all momentum/feel.
const SmoothScroll = ({ children }) => {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return <>{children}</>;
};

export default SmoothScroll;
