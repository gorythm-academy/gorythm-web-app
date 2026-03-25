// Features Section Component

import React from 'react';
import './FeaturesSection.scss';

const FeaturesSection = () => {
    const sectionData = {
        caption: "Why Choose Our Academy",
        description: "Discover the features that make our learning platform stand out and help you achieve your educational goals.",
        features: [
            {
                icon: <i className="fas fa-laptop-code"></i>,
                title: "Interactive Learning",
                description: "Engage with interactive lessons, quizzes, and hands-on projects that make learning effective and fun."
            },
            {
                icon: <i className="fas fa-user-tie"></i>,
                title: "Expert Instructors",
                description: "Learn from industry professionals and experienced educators passionate about teaching."
            },
            {
                icon: <i className="fas fa-clock"></i>,
                title: "Flexible Schedule",
                description: "Learn at your own pace with 24/7 access to course materials and lifetime updates."
            },
            {
                icon: <i className="fas fa-certificate"></i>,
                title: "Certification",
                description: "Earn recognized certificates to boost your career and showcase your skills."
            },
            {
                icon: <i className="fas fa-comments"></i>,
                title: "Community Support",
                description: "Join our active community of learners and get support from peers and mentors."
            },
            {
                icon: <i className="fas fa-briefcase"></i>,
                title: "Career Services",
                description: "Access career guidance, resume reviews, and job placement assistance."
            }
        ],
        bgImage: "https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?ixlib=rb-4.0.3&auto=format&fit=crop&w=1771&q=80",
        sectionNumber: "02"
    };

    return (
        <section
            className="front_page_section front_page_section_features scheme_dark"
            style={sectionData.bgImage ? {
                backgroundImage: `url(${sectionData.bgImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
            } : {}}
        >
            <div className="front_page_section_inner front_page_section_features_inner">
                <div className="content_wrap front_page_section_content_wrap front_page_section_features_content_wrap">

                    {/* Section Header with Number */}
                    <div className="section-header">
                        <span className="section-number">{sectionData.sectionNumber}</span>
                        <h2 className="front_page_section_caption front_page_section_features_caption">
                            {sectionData.caption}
                        </h2>
                    </div>

                    {/* Description */}
                    {sectionData.description && (
                        <div className="front_page_section_description front_page_section_features_description">
                            <p>{sectionData.description}</p>
                        </div>
                    )}

                    {/* Features Grid */}
                    <div className="front_page_section_output front_page_section_features_output">
                        <div className="features-grid">
                            {sectionData.features.map((feature, index) => (
                                <div key={index} className="feature-card">
                                    <div className="feature-icon">{feature.icon}</div>
                                    <h3 className="feature-title">{feature.title}</h3>
                                    <p className="feature-description">{feature.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </section>
    );
};

export default FeaturesSection;