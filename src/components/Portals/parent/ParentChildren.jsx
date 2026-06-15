import React, { useEffect, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader } from '../shared/PortalUi';

const ParentChildren = () => {
  const [children, setChildren] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    portalGet('/parent/children')
      .then((res) => {
        if (res.success) setChildren(res.children || []);
        else setError(res.error || 'Failed to load');
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="portal-page">
        <PortalAlert type="error">{error}</PortalAlert>
      </div>
    );
  }
  if (children === null) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  return (
    <div className="portal-page">
      <PortalPageHeader
        title="My children"
        subtitle="Links are created by admin in LMS → Parent links"
      />

      <div className="portal-hero portal-hero--parent">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-child" />
        </div>
        <div>
          <h2>Linked students</h2>
          <p>Students connected to your parent account by the academy admin.</p>
        </div>
      </div>

      <div className="portal-panel">
        <div className="portal-panel__head">
          <h2>Children list</h2>
        </div>
        <div className="portal-panel__body">
          {children.length === 0 ? (
            <p className="portal-select-hint" style={{ border: 'none', background: 'transparent' }}>
              No children linked yet. Contact admin.
            </p>
          ) : (
            <div className="portal-data-table-wrap">
              <table className="portal-data-table portal-data-table--green">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Student ID</th>
                    <th>Relation</th>
                  </tr>
                </thead>
                <tbody>
                  {children.map((r) => (
                    <tr key={r._id}>
                      <td>
                        <strong>{r.student?.name || '—'}</strong>
                      </td>
                      <td>{r.student?.studentId || '—'}</td>
                      <td>{r.relation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ParentChildren;
