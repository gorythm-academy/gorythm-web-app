import React, { useMemo } from 'react';
import { absFileUrl } from '../../../utils/fileUrl';
import { resolveMediaUrl } from '../../../utils/resolveMediaUrl';
import ResearchSeriesView from '../../Pages/ResearchSeriesView';
import { useDialogKeyboard } from '../../../hooks/useDialogKeyboard';

function listAttachments(record) {
  if (Array.isArray(record?.attachments) && record.attachments.length) {
    return record.attachments.filter(Boolean);
  }
  return record?.fileUrl ? [record.fileUrl] : [];
}

function fileLinkLabel(url, index, total) {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      return total > 1 ? `External link (${index + 1}) — ${host}` : `External link — ${host}`;
    } catch {
      return total > 1 ? `External link ${index + 1}` : 'External link';
    }
  }
  const name = decodeURIComponent(url.split('/').pop() || '').trim() || `File ${index + 1}`;
  return total > 1 ? `${name} (${index + 1})` : name;
}

export default function LmsMaterialPreviewModal({ open, kind, item, onClose }) {
  useDialogKeyboard({ isOpen: open, onClose });

  const attachments = useMemo(() => (item && kind !== 'research' ? listAttachments(item) : []), [item, kind]);
  const isLinkResource = kind === 'resource' && item?.type === 'link';
  const isResearch = kind === 'research';

  if (!open || !item) return null;

  const title = item.title || (kind === 'assignment' ? 'Assignment' : isResearch ? 'Article' : 'Resource');

  return (
    <div className="lms-material-preview-backdrop" onClick={onClose} role="presentation">
      <div
        className={`lms-material-preview${isResearch ? ' lms-material-preview--research' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lms-material-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="lms-material-preview__header">
          <div>
            <p className="lms-material-preview__kicker">
              {kind === 'assignment'
                ? 'Assignment preview'
                : isResearch
                  ? 'Research article preview'
                  : 'Resource preview'}
            </p>
            <h3 id="lms-material-preview-title">{title}</h3>
          </div>
          <button type="button" className="lms-material-preview__close" onClick={onClose} aria-label="Close preview">
            <i className="fas fa-times" aria-hidden />
          </button>
        </header>

        {item.dueDateNotice ? (
          <p className="lms-material-preview__notice" role="status">
            {item.dueDateNotice}
          </p>
        ) : null}

        <dl className="lms-material-preview__meta">
          {isResearch ? (
            <>
              <dt>Date</dt>
              <dd>{item.date || '—'}</dd>
              <dt>Author</dt>
              <dd>{item.author || '—'}</dd>
              <dt>Category</dt>
              <dd>{item.category || '—'}</dd>
              <dt>Status</dt>
              <dd>{item.isPublished !== false ? 'Published' : 'Draft'}</dd>
              <dt>Format</dt>
              <dd>{item.contentFormat === 'series-table' ? 'Series table' : 'Article'}</dd>
            </>
          ) : null}
          {!isResearch && item.course?.title ? (
            <>
              <dt>Course</dt>
              <dd>{item.course.title}</dd>
            </>
          ) : null}
          {kind === 'assignment' ? (
            <>
              <dt>Teacher</dt>
              <dd>{item.teacher?.name || 'Course instructor (default)'}</dd>
              <dt>Due date</dt>
              <dd>{item.dueDate ? new Date(item.dueDate).toLocaleDateString() : '—'}</dd>
            </>
          ) : null}
          {kind === 'resource' ? (
            <>
              <dt>Type</dt>
              <dd>{item.type || 'file'}</dd>
              <dt>Uploaded By</dt>
              <dd>
                {item.uploadedBy?.name || '—'}
                {item.uploadedBy?.role ? ` (${item.uploadedBy.role})` : ''}
              </dd>
            </>
          ) : null}
        </dl>

        {isResearch && item.imagePath ? (
          <section className="lms-material-preview__section">
            <h4>Cover Image</h4>
            <img
              className="lms-material-preview__cover"
              src={resolveMediaUrl(item.imagePath)}
              alt=""
            />
          </section>
        ) : null}

        {isResearch && item.excerpt?.trim() ? (
          <section className="lms-material-preview__section">
            <h4>Excerpt</h4>
            <p className="lms-material-preview__excerpt">{item.excerpt}</p>
          </section>
        ) : null}

        {isResearch ? (
          <section className="lms-material-preview__section">
            <h4>Content</h4>
            {item.contentFormat === 'series-table' ? (
              <ResearchSeriesView seriesData={item.seriesData} />
            ) : item.content?.trim() ? (
              <div
                className="lms-material-preview__article"
                dangerouslySetInnerHTML={{ __html: item.content }}
              />
            ) : (
              <p className="lms-material-preview__empty">No article body yet.</p>
            )}
          </section>
        ) : null}

        {!isResearch && item.description?.trim() ? (
          <section className="lms-material-preview__section">
            <h4>Description</h4>
            <div className="lms-material-preview__description">{item.description}</div>
          </section>
        ) : null}

        {!isResearch ? (
        <section className="lms-material-preview__section">
          <h4>{isLinkResource ? 'Link' : 'Files & attachments'}</h4>
          {attachments.length ? (
            <ul className="lms-material-preview__files">
              {attachments.map((url, index) => {
                const href =
                  url.startsWith('http://') || url.startsWith('https://') ? url : absFileUrl(url);
                return (
                  <li key={`${url}-${index}`}>
                    <a href={href} target="_blank" rel="noreferrer">
                      <i className="fas fa-external-link-alt" aria-hidden /> {fileLinkLabel(url, index, attachments.length)}
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="lms-material-preview__empty">
              {kind === 'assignment'
                ? 'No attachment files — students see the title, due date, and description above.'
                : item.type === 'note'
                  ? 'This is a text note with no separate file.'
                  : 'No files or links attached yet.'}
            </p>
          )}
        </section>
        ) : null}

        <footer className="lms-material-preview__actions">
          {isResearch && item.isPublished !== false && item.slug ? (
            <a
              className="lms-btn-secondary lms-material-preview__open-link"
              href={`/research/${item.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              <i className="fas fa-external-link-alt" aria-hidden /> Open on website
            </a>
          ) : null}
          <button type="button" className="lms-btn-secondary" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
