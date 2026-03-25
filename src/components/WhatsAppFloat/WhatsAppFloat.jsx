import React from 'react';
import './WhatsAppFloat.scss';

const WHATSAPP_URL =
  'https://web.whatsapp.com/send?phone=31684427025&text=I%27m%20interested%20in%20your%20courses';

const WhatsAppFloat = () => {
  return (
    <a
      href={WHATSAPP_URL}
      className="whatsapp-float"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
    >
      <i className="fab fa-whatsapp" aria-hidden="true" />
    </a>
  );
};

export default WhatsAppFloat;
