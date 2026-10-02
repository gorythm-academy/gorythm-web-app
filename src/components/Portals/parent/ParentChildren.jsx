import React, { useEffect, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import { PortalDataSection, PortalAlert, PortalPageHeader } from '../shared/PortalUi';

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

  const loading = children === null;
  const list = children || [];

  return (
    <div className="portal-page">
      <PortalPageHeader
        title="My Children"
        subtitle="Students linked to your parent account."
      />

      <div className="portal-hero portal-hero--parent">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-child" />
        </div>
        <div>
          <h2>Linked Students</h2>
          <p>Students connected to your parent account by the academy.</p>
        </div>
      </div>

      <div className="portal-panel">
        <div className="portal-panel__head">
          <h2>Children List</h2>
        </div>
        <div className="portal-panel__body">
          <PortalDataSection loading={loading} error={error} loadingLabel="Loading children…">
            {list.length === 0 ? (
            <p className="portal-select-hint" style={{ border: 'none', background: 'transparent' }}>
              No children are linked to this account yet. Please contact the academy to connect your child's profile.
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
                  {list.map((r) => (
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
          </PortalDataSection>
        </div>
      </div>
    </div>
  );
};

export default ParentChildren;
