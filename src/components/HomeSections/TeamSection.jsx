// Team Section Component

import React from 'react';
import './TeamSection.scss';

const TeamSection = () => {
    const teamData = {
        caption: "Meet Our Expert Instructors",
        description: "Learn from industry leaders and passionate educators who bring real-world experience to the classroom.",
        teamMembers: [
            {
                id: 1,
                name: "Dr. Sarah Chen",
                position: "Senior Web Development Instructor",
                bio: "Former Google engineer with 10+ years of experience in full-stack development. Specializes in React, Node.js, and cloud architecture.",
                image: "https://images.unsplash.com/photo-1494790108755-2616b786d4d9?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
                social: {
                    linkedin: "#",
                    twitter: "#",
                    github: "#",
                    website: "#"
                },
                expertise: ["React", "Node.js", "AWS", "TypeScript"]
            },
            {
                id: 2,
                name: "Michael Rodriguez",
                position: "Data Science Lead",
                bio: "PhD in Data Science with 8+ years at Microsoft. Expert in machine learning, Python, and big data analytics.",
                image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
                social: {
                    linkedin: "#",
                    twitter: "#",
                    kaggle: "#",
                    website: "#"
                },
                expertise: ["Python", "ML", "TensorFlow", "SQL"]
            },
            {
                id: 3,
                name: "Elena Sharma",
                position: "Digital Marketing Director",
                bio: "Former Marketing Director at Fortune 500 company. 12+ years experience in digital strategy and brand management.",
                image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
                social: {
                    linkedin: "#",
                    twitter: "#",
                    instagram: "#",
                    website: "#"
                },
                expertise: ["SEO", "Social Media", "Analytics", "Branding"]
            },
            {
                id: 4,
                name: "James Wilson",
                position: "UX/UI Design Expert",
                bio: "Award-winning designer with experience at Apple and Adobe. Specializes in user-centered design and prototyping.",
                image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
                social: {
                    linkedin: "#",
                    behance: "#",
                    dribbble: "#",
                    website: "#"
                },
                expertise: ["Figma", "UX Research", "Prototyping", "Design Systems"]
            }
        ],
        bgImage: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=1770&q=80"
    };

    const renderSocialIcon = (platform) => {
        const icons = {
            linkedin: <i className="fab fa-linkedin-in"></i>,
            twitter: <i className="fab fa-twitter"></i>,
            github: <i className="fab fa-github"></i>,
            website: <i className="fas fa-globe"></i>,
            instagram: <i className="fab fa-instagram"></i>,
            behance: <i className="fab fa-behance"></i>,
            dribbble: <i className="fab fa-dribbble"></i>,
            kaggle: <i className="fab fa-kaggle"></i>
        };
        return icons[platform] || <i className="fas fa-link"></i>;
    };

    return (
        <section 
            className="front_page_section front_page_section_team scheme_dark"
            style={teamData.bgImage ? { 
                backgroundImage: `url(${teamData.bgImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
            } : {}}
        >
            <div className="section-overlay"></div>
            
            <div className="front_page_section_inner front_page_section_team_inner">
                <div className="content_wrap front_page_section_content_wrap front_page_section_team_content_wrap">
                    
                    {/* Section Header */}
                    <div className="section-header">
                        <h2 className="front_page_section_caption front_page_section_team_caption">
                            {teamData.caption}
                        </h2>
                    </div>
                    
                    {/* Description */}
                    {teamData.description && (
                        <div className="front_page_section_description front_page_section_team_description">
                            <p>{teamData.description}</p>
                        </div>
                    )}
                    
                    {/* Team Members Grid */}
                    <div className="front_page_section_output front_page_section_team_output">
                        <div className="team-grid">
                            {teamData.teamMembers.map((member) => (
                                <div key={member.id} className="team-card">
                                    <div className="team-card-inner">
                                        {/* Team Member Image */}
                                        <div className="team-image">
                                            <img 
                                                src={member.image} 
                                                alt={member.name}
                                                loading="lazy"
                                                width={300}
                                                height={300}
                                                sizes="(min-width: 768px) 300px, 100vw"
                                            />
                                            <div className="image-overlay"></div>
                                        </div>
                                        
                                        {/* Team Member Info */}
                                        <div className="team-info">
                                            <h3 className="team-name">{member.name}</h3>
                                            <p className="team-position">{member.position}</p>
                                            
                                            {/* Bio */}
                                            <p className="team-bio">{member.bio}</p>
                                            
                                            {/* Expertise Tags */}
                                            <div className="team-expertise">
                                                {member.expertise.map((skill, index) => (
                                                    <span key={index} className="expertise-tag">
                                                        {skill}
                                                    </span>
                                                ))}
                                            </div>
                                            
                                            {/* Social Links */}
                                            <div className="team-social">
                                                {Object.entries(member.social).map(([platform, link]) => (
                                                    <a
                                                        key={platform}
                                                        href={link}
                                                        className="social-link"
                                                        aria-label={`${member.name}'s ${platform}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        {renderSocialIcon(platform)}
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        {/* Join Team CTA */}
                        <div className="team-cta">
                            <p className="cta-text">Interested in teaching with us?</p>
                            <a href="/careers" className="cta-button">
                                Become an Instructor
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default TeamSection;