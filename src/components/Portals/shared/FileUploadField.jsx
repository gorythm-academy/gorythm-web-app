import React, { useState } from 'react';
import { uploadLmsFile } from '../../../utils/fileUploadApi';
import { PortalAlert } from './PortalUi';

export default function FileUploadField({ label, value, onChange, accept = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp', realm }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    setBusy(true);
    try {
      const url = await uploadLmsFile(file, realm);
      onChange(url);
    } catch (ex) {
      setErr(ex.message || 'Upload failed');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  return (
    <label className="portal-field-label portal-file-upload">
      <span>{label}</span>
      <input type="file" accept={accept} onChange={onFile} disabled={busy} />
      {busy ? <small>Uploading…</small> : null}
      {value ? (
        <a href={value} target="_blank" rel="noreferrer" className="portal-file-link">
          View uploaded file
        </a>
      ) : (
        <small>Optional: upload a PDF, Word document, or image</small>
      )}
      {err ? <PortalAlert type="error">{err}</PortalAlert> : null}
    </label>
  );
}
