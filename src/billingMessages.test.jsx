import React from 'react';
import { render, screen } from '@testing-library/react';
import PortalBillingCheckout from './components/Portals/shared/PortalBillingCheckout';
import { formatDueDate } from './utils/billingLabels';

const enrollment = {
  enrollmentId: 'enr-1',
  studentId: 'student-1',
  studentName: 'Amina',
  courseName: 'Nazrah',
  amount: 30,
  dueDate: '2026-09-25T12:00:00.000Z',
  displayStatus: 'unpaid',
  enrollmentStatus: 'active',
  autoPayEnabled: false,
};

test('parent fees heading names the children', () => {
  render(
    <PortalBillingCheckout
      groupByChild
      enrollments={[enrollment]}
      onToggleAutoPay={() => {}}
      savedCardsByStudent={[{ studentId: 'student-1', cards: [] }]}
    />
  );

  expect(screen.getByRole('heading', { name: "Children's Courses" })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Turn on Auto-Pay' })).not.toBeInTheDocument();
});

test('auto-pay can be turned on when a card is saved', () => {
  render(
    <PortalBillingCheckout
      enrollments={[enrollment]}
      onToggleAutoPay={() => {}}
      savedCards={[{ id: 'card-1', brand: 'visa', last4: '4242' }]}
    />
  );

  expect(screen.getByRole('heading', { name: 'Your Courses' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Turn on Auto-Pay' })).toBeInTheDocument();
});

test('fee due dates use day-month-year', () => {
  expect(formatDueDate('2026-09-25T12:00:00+05:00')).toBe('25/09/2026');
});
