import { vi } from 'vitest';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import PaymentsManagement from './PaymentsManagement';
import UsersManagement from './UsersManagement';
import CoursesManagement from './CoursesManagement';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const pendingBill = {
  _id: 'pay1',
  transactionId: 'bank_1',
  status: 'pending',
  paymentMethod: 'bank',
  amount: 40,
  currency: 'USD',
  studentName: 'Omar',
  email: 'omar@example.com',
  courseName: 'Quran Basics',
  createdAt: '2026-01-05T10:00:00.000Z',
  lines: [{ course: 'c1', amount: 40 }],
};

function mockApi() {
  axios.get.mockImplementation(async (url) => {
    const target = String(url);
    if (target.endsWith('/api/payments')) {
      return { data: { success: true, payments: [pendingBill], total: 1, stats: {}, trashCount: 0 } };
    }
    return { data: { success: true } };
  });
  axios.post.mockResolvedValue({ data: { success: true } });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Object.values(axios).forEach((fn) => fn.mockReset?.());
  mockApi();
});

describe('admin screens render after the view split', () => {
  test('payments page lists a bill instead of crashing', async () => {
    render(
      <MemoryRouter>
        <PaymentsManagement />
      </MemoryRouter>
    );
    expect(await screen.findByRole('heading', { name: /payment management/i })).toBeInTheDocument();
    expect(await screen.findByText('Omar')).toBeInTheDocument();
  });

  test('users page renders', async () => {
    render(
      <MemoryRouter>
        <UsersManagement />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
  });

  test('courses page renders', async () => {
    render(
      <MemoryRouter>
        <CoursesManagement />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
  });
});

describe('recording a payment received', () => {
  async function openReceiveDialog() {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PaymentsManagement />
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: /mark received/i }));
    const dialog = await screen.findByRole('dialog');
    return { user, dialog };
  }

  test('the full bill is sent without an amount', async () => {
    const { user, dialog } = await openReceiveDialog();
    expect(within(dialog).getByLabelText(/amount received/i)).toHaveValue(40);
    await user.click(within(dialog).getByRole('button', { name: /^mark received$/i }));
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toMatch(/\/api\/payments\/pay1\/mark-received$/);
    expect(body).toEqual({});
  });

  test('a smaller amount is sent as a part payment', async () => {
    const { user, dialog } = await openReceiveDialog();
    const input = within(dialog).getByLabelText(/amount received/i);
    await user.clear(input);
    await user.type(input, '15.5');
    await user.click(within(dialog).getByRole('button', { name: /^mark received$/i }));
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    expect(axios.post.mock.calls[0][1]).toEqual({ amount: 15.5 });
  });

  test('more than the bill is refused before anything is sent', async () => {
    const { user, dialog } = await openReceiveDialog();
    const input = within(dialog).getByLabelText(/amount received/i);
    await user.clear(input);
    await user.type(input, '41');
    window.alert = vi.fn();
    await user.click(within(dialog).getByRole('button', { name: /^mark received$/i }));
    expect(axios.post).not.toHaveBeenCalled();
  });
});
