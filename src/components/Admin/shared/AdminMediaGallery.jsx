import React from 'react';
import { resolveMediaUrl } from '../../../utils/resolveMediaUrl';

/**
 * Shared admin gallery grid for course images, video thumbnails, and research covers.
 */
export default function AdminMediaGallery({
  images = [],
  loading = false,
  selectedPath = '',
  onSelect,
  onDelete,
  emptyMessage = 'No images in this folder yet.',
  showFilename = true,
  gridClassName = 'course-image-section__gallery',
}) {
  if (loading && images.length === 0) {
    return (
      <div className="promo-thumb-gallery__loading">
        <i className="fas fa-spinner fa-spin" aria-hidden="true" />
        Loading gallery…
      </div>
    );
  }

  if (images.length === 0) {
    return <p className="course-image-section__gallery-empty">{emptyMessage}</p>;
  }

  return (
    <div className={`${gridClassName} promo-thumb-gallery__grid`}>
      {images.map((img) => {
        const isSelected = selectedPath && selectedPath === img.path;
        const missingFile = img.onDisk === false;
        return (
          <div
            key={img.path}
            className={`course-image-section__tile${isSelected ? ' is-selected' : ''}${
              missingFile ? ' is-missing-file' : ''
            }`}
          >
            <button
              type="button"
              className="course-image-section__tile-select"
              onClick={() => !missingFile && onSelect?.(img.path)}
              disabled={missingFile}
              title={
                missingFile
                  ? 'File missing on server — re-upload this image'
                  : img.usedByTitles?.join(', ') || img.filename || 'Select image'
              }
            >
              {missingFile ? (
                <span className="promo-thumb-gallery__missing">
                  <i className="fas fa-unlink" aria-hidden="true" />
                  <span>Missing file</span>
                </span>
              ) : (
                <img src={resolveMediaUrl(img.path)} alt="" loading="lazy" />
              )}
              {isSelected ? (
                <span className="course-image-section__tile-badge">
                  <i className="fas fa-check" aria-hidden="true" />
                </span>
              ) : null}
              {img.usedBy > 0 ? (
                <span className="course-image-section__tile-used">{img.usedBy} in use</span>
              ) : null}
            </button>
            <button
              type="button"
              className="course-image-section__tile-delete"
              onClick={(e) => onDelete?.(img, e)}
              title="Delete from server folder"
            >
              <i className="fas fa-trash-alt" aria-hidden="true" />
            </button>
            {showFilename ? (
              <span className="promo-thumb-gallery__filename" title={img.filename}>
                {img.filename}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
