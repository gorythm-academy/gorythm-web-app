import React from 'react';
import OptimizedPicture from '../OptimizedPicture/OptimizedPicture';
import { getResearchPostImage } from '../../utils/researchPosts';

export function ResearchPostImage({ post, alt, className, loading = 'lazy', width = 400, height = 250, sizes }) {
  const img = getResearchPostImage(post);
  if (!img) return null;

  if (img.type === 'single') {
    return (
      <img
        src={img.url}
        alt={alt || post.title || 'Research article'}
        className={className}
        loading={loading}
        width={width}
        height={height}
      />
    );
  }

  return (
    <OptimizedPicture
      avifSrc={img.avif}
      webpSrc={img.webp}
      fallbackSrc={img.png}
      alt={alt || post.title || 'Research article'}
      className={className}
      loading={loading}
      width={width}
      height={height}
      sizes={sizes}
    />
  );
}

export default ResearchPostImage;
