import React from 'react';
import UsersManagement from './UsersManagement';

/**
 * People = same layout and controls as Users tab; only data segment (learners) differs.
 */
const PeopleManagement = () => (
  <UsersManagement key="people-tab" variant="people" />
);

export default PeopleManagement;
