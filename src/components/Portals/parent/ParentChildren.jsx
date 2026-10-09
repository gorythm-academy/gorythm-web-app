import React, { useEffect, useState } from 'react';
import { portalGet, readPortalCache } from '../shared/portalApi';
import { PortalDataSection, PortalPageHeader } from '../shared/PortalUi';
import { EnrollmentSummaryList, StudentIdLine } from '../shared/StudentIdentity';

const ParentChildren = () => {
  const [children, setChildren] = useState(() => readPortalCache('/parent/children')?.children ?? null);
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
          <p>Each card shows the student ID and the courses the academy has added.</p>
        </div>
      </div>

      <PortalDataSection loading={loading} error={error} loadingLabel="Loading children…">
        {list.length === 0 ? (
          <p className="portal-select-hint">
            No children are linked to this account yet. Please contact the academy to connect your child's profile.
          </p>
        ) : (
          list.map((link) => (
            <article key={link._id} className="portal-student-card">
              <header className="portal-student-card__head">
                <div>
                  <h3>{link.student?.name || '—'}</h3>
                  <StudentIdLine studentId={link.student?.studentId} />
                </div>
              </header>
              <EnrollmentSummaryList enrollments={link.enrollments || []} />
            </article>
          ))
        )}
      </PortalDataSection>
    </div>
  );
};

export default ParentChildren;
