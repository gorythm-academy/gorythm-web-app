import React, { useState, useEffect, useRef } from 'react';
import './Cursor.scss';

const Cursor = () => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [hidden, setHidden] = useState(false);
  const [clicked, setClicked] = useState(false);
  const [linkHovered, setLinkHovered] = useState(false);
  const [cursorSize, setCursorSize] = useState(8);
  
  const requestRef = useRef();
  const previousTimeRef = useRef();
  const cursorRef = useRef();
  const followerRef = useRef();
  
  // Check if device is touch-enabled
  const isTouchDevice = typeof window !== 'undefined' && (
    'ontouchstart' in window || 
    navigator.maxTouchPoints > 0 || 
    navigator.msMaxTouchPoints > 0
  );
  
  // Main animation loop for smooth trailing effect
  useEffect(() => {
    if (isTouchDevice) return; // Don't set up for mobile
    
    const handleMouseMove = (e) => {
      console.log('Mouse moved:', e.clientX, e.clientY);
      setPosition({ x: e.clientX, y: e.clientY });
    };
    
    console.log('Adding mouse listener');
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      console.log('Removing mouse listener');
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isTouchDevice]);
  
  // Mouse event listeners
  useEffect(() => {
    if (isTouchDevice) return; // Don't set up for mobile
    
    let timeoutId;
    
    const handleMouseMove = (e) => {
      setPosition({ x: e.clientX, y: e.clientY });
      if (hidden) setHidden(false);
      clearTimeout(timeoutId);
    };
    
    const handleMouseLeave = () => {
      timeoutId = setTimeout(() => setHidden(true), 100);
    };
    
    const handleMouseEnter = () => {
      setHidden(false);
      clearTimeout(timeoutId);
    };
    
    const handleMouseDown = () => setClicked(true);
    const handleMouseUp = () => setClicked(false);
    
    const handleMouseOver = (e) => {
      const target = e.target;
      const isInteractive = 
        target.tagName === 'A' || 
        target.tagName === 'BUTTON' ||
        target.closest('a') || 
        target.closest('button') ||
        target.hasAttribute('data-hover') ||
        target.classList.contains('hover-effect');
      
      if (isInteractive) {
        setLinkHovered(true);
        setCursorSize(16);
      }
    };
    
    const handleMouseOut = (e) => {
      setLinkHovered(false);
      setCursorSize(14);
    };
    
    // Add event listeners
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    
    // Hide default cursor
    document.body.style.cursor = 'none';
    
    // Cleanup
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      document.body.style.cursor = 'auto';
      clearTimeout(timeoutId);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [hidden, isTouchDevice]);
  
  // Build CSS classes
  const cursorClasses = [
    'custom-cursor',
    hidden && 'cursor-hidden',
    clicked && 'cursor-clicked',
    linkHovered && 'cursor-hover'
  ].filter(Boolean).join(' ');
  
  // Don't render cursor on mobile
  if (isTouchDevice) {
    return null;
  }
  
  return (
    <>
      {/* Main cursor dot (white circle) */}
      <div 
        ref={cursorRef}
        className={cursorClasses}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${cursorSize}px`,
          height: `${cursorSize}px`
        }}
      />
    </>
  );
};

export default Cursor;