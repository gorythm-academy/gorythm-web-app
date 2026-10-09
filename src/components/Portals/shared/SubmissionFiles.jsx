import React from 'react';
import { downloadProtectedUpload, ProtectedFileLink, uploadDisplayName } from '../../../utils/fileUrl';

export default function SubmissionFiles({ attachments }) {
  if (!attachments?.length) return <span>—</span>;
  return (
    <ul className="portal-submission-files">
      {attachments.map((url, i) => {
        const name = uploadDisplayName(url);
        return (
          <li key={`${url}-${i}`}>
            <ProtectedFileLink
              path={url}
              className="portal-file-download"
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                downloadProtectedUpload(url);
              }}
            >
              {name}
            </ProtectedFileLink>
          </li>
        );
      })}
    </ul>
  );
}
