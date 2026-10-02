import React from 'react';

function resourceTypeLabel(type) {
  if (type === 'link') return 'Link';
  if (type === 'note') return 'Note';
  return 'File';
}

export default function PortalContentResourcesTable({ resources, onPreview, emptyMessage }) {
  if (!resources?.length) {
    return <p className="portal-empty">{emptyMessage || 'There is no learning material to show yet.'}</p>;
  }

  return (
    <div className="portal-data-table-wrap">
      <table className="portal-data-table portal-content-resources-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Course</th>
            <th>Type</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {resources.map((resource) => (
            <tr key={resource._id}>
              <td>{resource.title || '—'}</td>
              <td>{resource.course?.title || '—'}</td>
              <td>{resourceTypeLabel(resource.type)}</td>
              <td>
                <div className="portal-table-actions">
                  <button
                    type="button"
                    className="lms-btn-secondary lms-btn-secondary--compact"
                    onClick={() => onPreview(resource)}
                  >
                    <i className="fas fa-eye" aria-hidden /> Preview
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
