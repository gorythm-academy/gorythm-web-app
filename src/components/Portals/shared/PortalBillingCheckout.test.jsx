import { vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PortalBillingCheckout from './PortalBillingCheckout';

const baseFee = {
  enrollmentId: 'e1',
  studentId: 's1',
  studentName: 'Omar',
  courseId: 'c1',
  courseName: 'Quran Basics',
  amount: 40,
  dueDate: '2030-01-10T00:00:00.000Z',
  displayStatus: 'unpaid',
  paymentStatus: 'pending',
  enrollmentStatus: 'active',
  selectable: true,
  totalFeeCount: 4,
  paidInstallmentCount: 0,
};

function renderCheckout(fee, props = {}) {
  const onPayStripe = vi.fn().mockResolvedValue(undefined);
  render(
    <PortalBillingCheckout
      enrollments={[fee]}
      payments={[]}
      onPayStripe={onPayStripe}
      onPayBank={vi.fn()}
      {...props}
    />
  );
  return { onPayStripe };
}

describe('portal fee checkout', () => {
  test('lists the fee and charges the full month when nothing was received yet', async () => {
    const user = userEvent.setup();
    const { onPayStripe } = renderCheckout(baseFee);
    expect(await screen.findByText('Quran Basics')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^pay$/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('$40.00', { selector: 'strong' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /pay now/i }));
    await waitFor(() => expect(onPayStripe).toHaveBeenCalled());
    expect(onPayStripe.mock.calls[0][0]).toMatchObject({ enrollmentIds: ['e1'], months: 1 });
  });

  test('shows the money already received and charges only the balance', async () => {
    const user = userEvent.setup();
    renderCheckout({ ...baseFee, partialPaidAmount: 15 });
    expect(await screen.findByText(/\$15\.00 received · \$25\.00 left/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^pay$/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('$25.00', { selector: 'strong' })).toBeInTheDocument();
    expect(within(dialog).getByText(/\$15\.00 already received/)).toBeInTheDocument();
  });
});
