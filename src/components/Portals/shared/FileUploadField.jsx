import React, { useState } from 'react';
import { PortalAlert } from './PortalUi';
import { absFileUrl } from '../../../utils/fileUrl';

export const LMS_UPLOAD_HINT = 'Max 12 MB per file; PDF, Word, or image.';

const fileLabel = (item) => {
  if (typeof item === 'string') return item.split('/').pop() || 'File';
  if (item?.defer && item?.name) return item.name;
  return 'File';
};

export default function FileUploadField({
  label,
  value,
  onChange,
  accept = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp',
  deferUpload = true,
  multiple = false,
  hint = LMS_UPLOAD_HINT,
}) {
  const [err, setErr] = useState('');

  const items = multiple
    ? (Array.isArray(value) ? value : value ? [value] : [])
    : null;

  const onFile = (e) => {
    const picked = multiple ? [...(e.target.files || [])] : [e.target.files?.[0]].filter(Boolean);
    if (!picked.length) return;
    setErr('');
    if (deferUpload) {
      const pending = picked.map((file) => ({ defer: true, file, name: file.name }));
      if (multiple) {
        onChange([...(items || []), ...pending]);
      } else {
        onChange(pending[0]);
      }
      e.target.value = '';
      return;
    }
    setErr('Immediate upload is disabled. Save the form to upload.');
    e.target.value = '';
  };

  const removeAt = (index) => {
    setErr('');
    if (multiple) {
      onChange(items.filter((_, i) => i !== index));
      return;
    }
    onChange('');
  };

  const clearAll = () => {
    setErr('');
    onChange(multiple ? [] : '');
  };

  if (multiple) {
    const hasItems = items.length > 0;
    return (
      <div className="portal-field-label portal-file-upload">
        <span>{label}</span>
        <input type="file" accept={accept} multiple onChange={onFile} />
        <small>{hint} You can select multiple files; they upload when you save.</small>
        {hasItems ? (
          <ul className="portal-file-list">
            {items.map((item, index) => {
              const uploadedUrl = typeof item === 'string' && item ? item : '';
              const pendingName = item?.defer ? item.name : '';
              return (
                <li key={`${fileLabel(item)}-${index}`}>
                  <span className="portal-file-list-name">{pendingName || fileLabel(item)}</span>
                  {uploadedUrl ? (
                    <a
                      href={absFileUrl(uploadedUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="portal-file-link"
                    >
                      View
                    </a>
                  ) : pendingName ? (
                    <small>Pending upload</small>
                  ) : null}
                  <button type="button" className="portal-file-remove" onClick={() => removeAt(index)}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {hasItems ? (
          <button type="button" className="portal-file-remove portal-file-remove--all" onClick={clearAll}>
            Remove all files
          </button>
        ) : null}
        {err ? <PortalAlert type="error">{err}</PortalAlert> : null}
      </div>
    );
  }

  const pendingName = value?.defer ? value.name : '';
  const uploadedUrl = typeof value === 'string' && value ? value : '';
  const hasFile = Boolean(pendingName || uploadedUrl);

  return (
    <label className="portal-field-label portal-file-upload">
      <span>{label}</span>
      <input type="file" accept={accept} onChange={onFile} />
      {pendingName ? (
        <small>Selected: {pendingName} (uploads when you save)</small>
      ) : (
        <small>{hint}</small>
      )}
      {uploadedUrl ? (
        <a href={absFileUrl(uploadedUrl)} target="_blank" rel="noreferrer" className="portal-file-link">
          View current file
        </a>
      ) : null}
      {hasFile ? (
        <button type="button" className="portal-file-remove" onClick={clearAll}>
          Remove file
        </button>
      ) : null}
      {err ? <PortalAlert type="error">{err}</PortalAlert> : null}
    </label>
  );
}
