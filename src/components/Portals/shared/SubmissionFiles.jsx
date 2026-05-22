import React from 'react';
import { absFileUrl } from '../../../utils/fileUrl';

export default function SubmissionFiles({ attachments }) {
  if (!attachments?.length) return <span>—</span>;
  return (
    <ul className="portal-submission-files">
      {attachments.map((url, i) => (
        <li key={`${url}-${i}`}>
          <a href={absFileUrl(url)} target="_blank" rel="noreferrer">
            {attachments.length > 1 ? `Download file ${i + 1}` : 'Download submitted file'}
          </a>
        </li>
      ))}
    </ul>
  );
}
