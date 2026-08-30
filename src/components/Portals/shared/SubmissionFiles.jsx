import React from 'react';
import { absFileUrl, uploadDisplayName } from '../../../utils/fileUrl';

export default function SubmissionFiles({ attachments }) {
  if (!attachments?.length) return <span>—</span>;
  return (
    <ul className="portal-submission-files">
      {attachments.map((url, i) => {
        const name = uploadDisplayName(url);
        return (
          <li key={`${url}-${i}`}>
            <a href={absFileUrl(url)} download={name} className="portal-file-download">
              {name}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
