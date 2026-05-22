import React, { useEffect, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader, SimpleTable } from '../shared/PortalUi';

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
      <SimpleTable
        columns={[
          { key: 'name', label: 'Name', render: (r) => r.student?.name },
          { key: 'studentId', label: 'Student ID', render: (r) => r.student?.studentId || '—' },
          { key: 'relation', label: 'Relation', render: (r) => r.relation },
        ]}
        rows={children}
        emptyLabel="No children linked yet. Contact admin."
      />
    </div>
  );
};

export default ParentChildren;
