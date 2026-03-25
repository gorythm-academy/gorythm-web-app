// Contacts Section Component

import React, { useState } from 'react';
import { CONTACT_EMAIL, FACEBOOK_URL } from '../../config/constants';
import './ContactsSection.scss';

const ContactsSection = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate API call
    setTimeout(() => {
      console.log('Form submitted:', formData);
      setIsSubmitting(false);
      setIsSubmitted(true);
      setFormData({
        name: '',
        email: '',
        subject: '',
        message: ''
      });

      // Reset success message after 5 seconds
      setTimeout(() => {
        setIsSubmitted(false);
      }, 5000);
    }, 1500);
  };

  // Contact data matching the demo
  const sectionData = {
    caption: "Get In Touch With Us",
    description: "Have questions about our courses, enrollment, or learning process? Our support team is here to help.",
    contactInfo: [
      {
        icon: "📍",
        title: "Visit Our Observatory",
        details: ["123 Observatory Lane", "Star City, SC 12345", "Open: Mon-Sat, 9AM-9PM"]
      },
      {
        icon: "📞",
        title: "Call Us",
        details: ["(123) 456-7890", "Mon-Fri: 8AM-6PM", "Sat-Sun: 10AM-4PM"]
      },
      {
        icon: "📧",
        title: "Email Us",
        details: [CONTACT_EMAIL, "Response: Within 24 hours"]
      }
    ],
    bgImage: "https://images.unsplash.com/photo-1519681393784-d120267933ba?ixlib=rb-4.0.3&auto=format&fit=crop&w=1770&q=80"
  };

  return (
    <section 
      className="front_page_section front_page_section_contacts scheme_dark"
      style={sectionData.bgImage ? { 
        backgroundImage: `url(${sectionData.bgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      } : {}}
    >
      <div className="section-overlay"></div>
      
      <div className="front_page_section_inner front_page_section_contacts_inner">
        <div className="content_wrap front_page_section_content_wrap front_page_section_contacts_content_wrap">
          
          {/* Section Header */}
          <div className="section-header">
            <h2 className="front_page_section_caption front_page_section_contacts_caption">
              {sectionData.caption}
            </h2>
          </div>

          {/* Description */}
          {sectionData.description && (
            <div className="front_page_section_description front_page_section_contacts_description">
              <p>{sectionData.description}</p>
            </div>
          )}

          {/* Two Column Layout - Content & Form */}
          <div className="contacts-content-columns">
            
            {/* Left Column - Contact Information */}
            <div className="contact-info-column">
              <div className="contact-info-grid">
                {sectionData.contactInfo.map((info, index) => (
                  <div key={index} className="contact-info-card">
                    <div className="contact-icon">{info.icon}</div>
                    <h3 className="contact-title">{info.title}</h3>
                    <div className="contact-details">
                      {info.details.map((detail, idx) => (
                        <p key={idx} className="contact-detail">{detail}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Social Media Links */}
              <div className="contact-social-links">
                <h3 className="social-title">Follow Our Journey</h3>
                <div className="social-icons">
                  <a href="#" className="social-icon" aria-label="Twitter">🐦</a>
                  <a href={FACEBOOK_URL} className="social-icon" aria-label="Facebook" target="_blank" rel="noopener noreferrer">📘</a>
                  <a href="#" className="social-icon" aria-label="Instagram">📷</a>
                  <a href="#" className="social-icon" aria-label="YouTube">📺</a>
                  <a href="#" className="social-icon" aria-label="LinkedIn">💼</a>
                </div>
              </div>
            </div>

            {/* Right Column - Contact Form */}
            <div className="contact-form-column">
              {isSubmitted ? (
                <div className="form-success-message">
                  <div className="success-icon">✓</div>
                  <h3>Message Sent Successfully!</h3>
                  <p>Thank you for contacting us. We'll get back to you within 24 hours.</p>
                </div>
              ) : (
                <form className="contact-form" onSubmit={handleSubmit}>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="name" className="form-label">Your Name *</label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        className="form-input"
                        required
                        disabled={isSubmitting}
                        placeholder="John Smith"
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="email" className="form-label">Email Address *</label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        className="form-input"
                        required
                        disabled={isSubmitting}
                        placeholder="john@example.com"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="subject" className="form-label">Subject *</label>
                    <input
                      type="text"
                      id="subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleInputChange}
                      className="form-input"
                      required
                      disabled={isSubmitting}
                      placeholder="Telescope Inquiry"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="message" className="form-label">Your Message *</label>
                    <textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleInputChange}
                      className="form-textarea"
                      rows="5"
                      required
                      disabled={isSubmitting}
                      placeholder="Tell us about your astronomy questions or telescope needs..."
                    />
                  </div>

                  <div className="form-footer">
                    <p className="form-note">* Required fields</p>
                    <button 
                      type="submit" 
                      className="submit-button"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <span className="spinner"></span>
                          Sending...
                        </>
                      ) : 'Send Message'}
                    </button>
                  </div>
                </form>
              )}
            </div>

          </div>

        </div>
      </div>
    </section>
  );
};

export default ContactsSection;