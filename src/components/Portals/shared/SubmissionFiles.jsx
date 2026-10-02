import React from 'react';
import { absFileUrl, downloadProtectedUpload, uploadDisplayName } from '../../../utils/fileUrl';

export default function SubmissionFiles({ attachments }) {
  if (!attachments?.length) return <span>—</span>;
  return (
    <ul className="portal-submission-files">
      {attachments.map((url, i) => {
        const name = uploadDisplayName(url);
        const href = absFileUrl(url);
        return (
          <li key={`${url}-${i}`}>
            <a
              href={href}
              className="portal-file-download"
              onClick={(event) => {
                if (!href || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                downloadProtectedUpload(url);
              }}
            >
              {name}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
