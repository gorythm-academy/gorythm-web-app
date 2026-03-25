import React from 'react';
import { FACEBOOK_URL } from '../../config/constants';
import './HeaderSocialDots.scss';

const HeaderSocialDots = () => {
  const socialItems = [
    { id: 1, name: 'Facebook', icon: 'fb', social: 'facebook', url: FACEBOOK_URL },
    //{ id: 2, name: 'Twitter', icon: 'tw', social: 'twitter', url: '#' },
   // { id: 3, name: 'LinkedIn', icon: 'in', social: 'linkedin', url: '#' },
    { id: 4, name: 'Instagram', icon: 'ig', social: 'instagram', url: '#' },
    { id: 5, name: 'YouTube', icon: 'yt', social: 'youtube', url: '#' },
  ];

  const [activeDot, setActiveDot] = React.useState(0);

  return (
    <div className="header-social-dots">
      {socialItems.map((item, index) => (
        <a
          key={item.id}
          href={item.url}
          className={`social-dot ${activeDot === index ? 'active' : ''}`}
          data-social={item.social}
          data-tooltip={item.name}
          aria-label={item.name}
          onClick={(e) => {
            setActiveDot(index);
          }}
          onMouseEnter={() => setActiveDot(index)}
        />
      ))}
    </div>
  );
};

export default HeaderSocialDots;