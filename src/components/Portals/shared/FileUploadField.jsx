import React, { useRef, useState } from 'react';
import { PortalAlert } from './PortalUi';
import { absFileUrl, uploadDisplayName } from '../../../utils/fileUrl';

export const LMS_UPLOAD_HINT = 'Max 12 MB per file; PDF, Word, or image.';

const fileLabel = (item) => {
  if (typeof item === 'string') return uploadDisplayName(item);
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
  const inputRef = useRef(null);

  const items = multiple
    ? Array.isArray(value)
      ? value
      : value
        ? [value]
        : []
    : value
      ? [value]
      : [];

  const onFile = (e) => {
    const picked = multiple ? [...(e.target.files || [])] : [e.target.files?.[0]].filter(Boolean);
    if (!picked.length) return;
    setErr('');
    if (deferUpload) {
      const pending = picked.map((file) => ({ defer: true, file, name: file.name }));
      if (multiple) {
        onChange([...items, ...pending]);
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
    if (inputRef.current) inputRef.current.value = '';
  };

  const hasItems = items.length > 0;

  return (
    <div className="portal-field-label portal-file-upload">
      <span>{label}</span>
      <div className="portal-file-upload__control">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={onFile}
        />
        <button type="button" className="portal-file-upload__pick" onClick={() => inputRef.current?.click()}>
          <i className="fas fa-cloud-upload-alt" aria-hidden="true" />
          Choose file{multiple ? 's' : ''}
        </button>
      </div>
      <small className="portal-file-upload__hint">{hint}</small>
      {hasItems ? (
        <ul className="portal-file-list">
          {items.map((item, index) => {
            const uploadedUrl = typeof item === 'string' && item ? item : '';
            const pendingName = item?.defer ? item.name : '';
            const displayName = pendingName || fileLabel(item);
            return (
              <li key={`${displayName}-${index}`}>
                <span className="portal-file-list-name">{displayName}</span>
                {uploadedUrl ? (
                  <a
                    href={absFileUrl(uploadedUrl)}
                    download={uploadDisplayName(uploadedUrl)}
                    className="portal-file-link"
                  >
                    Download
                  </a>
                ) : pendingName ? (
                  <small className="portal-file-pending">Pending upload</small>
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
