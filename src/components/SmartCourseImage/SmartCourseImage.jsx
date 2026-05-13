import React, { useEffect, useState } from 'react';
import { getCourseImageCandidates } from '../../utils/courseImages';

/**
 * Runtime fallback for course artwork:
 * tries AVIF -> WebP -> PNG -> placeholder.
 *
 * This is safer than relying only on <picture> for dynamic public paths because
 * if a selected source 404s, we can still continue to the next candidate.
 */
export default function SmartCourseImage({ course, ...imgProps }) {
  const slugKey = `${course?.slug || ''}:${course?._id || ''}`;
  const candidates = getCourseImageCandidates(course);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [slugKey]);

  const src = candidates[Math.min(candidateIndex, candidates.length - 1)];

  const handleError = () => {
    setCandidateIndex((prev) => Math.min(prev + 1, candidates.length - 1));
  };

  const alt = imgProps.alt ?? '';
  return <img src={src} alt={alt} onError={handleError} {...imgProps} />;
}
