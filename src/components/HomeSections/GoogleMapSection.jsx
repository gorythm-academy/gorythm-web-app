// Google Map Section Component

import React, { useState, useEffect } from 'react';
import { CONTACT_EMAIL } from '../../config/constants';
import './GoogleMapSection.scss';

const GoogleMapSection = () => {
  const [mapLoaded, setMapLoaded] = useState(false);

  // Google Maps data matching the demo
  const mapData = {
    caption: "Find Our Observatory",
    description: "Visit us at our state-of-the-art observatory facility. We're open to the public for tours, stargazing events, and educational programs.",
    content: "Our observatory is located in the heart of Star City's astronomy district, featuring multiple telescopes, a planetarium, and research facilities.",
    location: {
      address: "123 Observatory Lane, Star City, SC 12345",
      coordinates: { lat: 34.0522, lng: -118.2437 },
      hours: {
        weekdays: "9:00 AM - 9:00 PM",
        weekends: "10:00 AM - 11:00 PM",
        special: "Extended hours during meteor showers"
      },
      contact: {
        phone: "(123) 456-7890",
        email: CONTACT_EMAIL
      }
    },
    layout: "columns", // 'fullwidth' or 'columns'
    bgImage: "https://images.unsplash.com/photo-1519681393784-d120267933ba?ixlib=rb-4.0.3&auto=format&fit=crop&w=1770&q=80"
  };

  // Simulate map loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setMapLoaded(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // Google Maps embed URL (static image for demo, replace with actual embed if needed)
  const mapEmbedUrl = `https://www.google.com/maps/embed/v1/place?key=YOUR_API_KEY&q=${encodeURIComponent(mapData.location.address)}&zoom=14`;

  return (
    <section 
      className={`front_page_section front_page_section_googlemap scheme_dark front_page_section_layout_${mapData.layout}`}
      style={mapData.bgImage ? { 
        backgroundImage: `url(${mapData.bgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      } : {}}
    >
      <div className="section-overlay"></div>
      
      <div className={`front_page_section_inner front_page_section_googlemap_inner front_page_section_layout_${mapData.layout}`}>
        <div className={`front_page_section_content_wrap front_page_section_googlemap_content_wrap ${mapData.layout !== 'fullwidth' ? 'content_wrap' : ''}`}>
          
          {/* Section Header for fullwidth layout */}
          {mapData.layout === 'fullwidth' && (
            <div className="content_wrap">
              <div className="section-header">
                <h2 className="front_page_section_caption front_page_section_googlemap_caption">
                  {mapData.caption}
                </h2>
              </div>

              {/* Description */}
              {mapData.description && (
                <div className="front_page_section_description front_page_section_googlemap_description">
                  <p>{mapData.description}</p>
                </div>
              )}
            </div>
          )}

          {/* Two Column Layout (default) */}
          {mapData.layout === 'columns' && (
            <div className="map-content-columns">
              
              {/* Left Column - Location Information */}
              <div className="location-info-column">
                {/* Header for columns layout */}
                <div className="section-header">
                  <h2 className="front_page_section_caption front_page_section_googlemap_caption">
                    {mapData.caption}
                  </h2>
                </div>

                {/* Description */}
                {mapData.description && (
                  <div className="front_page_section_description front_page_section_googlemap_description">
                    <p>{mapData.description}</p>
                  </div>
                )}

                {/* Content */}
                {mapData.content && (
                  <div className="front_page_section_content front_page_section_googlemap_content">
                    <p>{mapData.content}</p>
                  </div>
                )}

                {/* Location Details */}
                <div className="location-details">
                  <div className="detail-card">
                    <div className="detail-icon">📍</div>
                    <div className="detail-content">
                      <h3>Address</h3>
                      <p>{mapData.location.address}</p>
                    </div>
                  </div>

                  <div className="detail-card">
                    <div className="detail-icon">⏰</div>
                    <div className="detail-content">
                      <h3>Hours</h3>
                      <div className="hours-list">
                        <div className="hours-item">
                          <span className="hours-day">Mon-Fri:</span>
                          <span className="hours-time">{mapData.location.hours.weekdays}</span>
                        </div>
                        <div className="hours-item">
                          <span className="hours-day">Sat-Sun:</span>
                          <span className="hours-time">{mapData.location.hours.weekends}</span>
                        </div>
                        <div className="hours-item">
                          <span className="hours-special">{mapData.location.hours.special}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="detail-card">
                    <div className="detail-icon">📞</div>
                    <div className="detail-content">
                      <h3>Contact</h3>
                      <div className="contact-info">
                        <p>Phone: {mapData.location.contact.phone}</p>
                        <p>Email: {mapData.location.contact.email}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Directions Button */}
                <div className="directions-cta">
                  <a 
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapData.location.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="directions-button"
                  >
                    Get Directions
                  </a>
                </div>
              </div>

              {/* Right Column - Map */}
              <div className="map-column">
                <div className="map-container">
                  {mapLoaded ? (
                    <>
                      {/* Interactive Map Placeholder */}
                      <div className="interactive-map">
                        <div className="map-overlay"></div>
                        <div className="map-marker">
                          <div className="marker-pin"></div>
                          <div className="marker-label">Gorythm Academy</div>
                        </div>
                        <div className="map-coordinates">
                          <span>Lat: {mapData.location.coordinates.lat}</span>
                          <span>Lng: {mapData.location.coordinates.lng}</span>
                        </div>
                      </div>
                      
                      {/* Map Controls */}
                      <div className="map-controls">
                        <button className="map-control zoom-in">+</button>
                        <button className="map-control zoom-out">-</button>
                        <button className="map-control reset">↻</button>
                      </div>
                    </>
                  ) : (
                    <div className="map-loading">
                      <div className="loading-spinner"></div>
                      <p>Loading map...</p>
                    </div>
                  )}

                  {/* Map Legend */}
                  <div className="map-legend">
                    <div className="legend-item">
                      <span className="legend-color parking"></span>
                      <span className="legend-text">Parking Available</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-color telescope"></span>
                      <span className="legend-text">Telescope Locations</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-color entrance"></span>
                      <span className="legend-text">Main Entrance</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* Fullwidth Layout (just map) */}
          {mapData.layout === 'fullwidth' && (
            <div className="fullwidth-map-container">
              <div className="map-container">
                {mapLoaded ? (
                  <div className="fullwidth-map">
                    <div className="map-overlay"></div>
                    <div className="map-marker">
                      <div className="marker-pin"></div>
                      <div className="marker-label">Gorythm Academy</div>
                    </div>
                  </div>
                ) : (
                  <div className="map-loading">
                    <div className="loading-spinner"></div>
                    <p>Loading map...</p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </section>
  );
};

export default GoogleMapSection;
