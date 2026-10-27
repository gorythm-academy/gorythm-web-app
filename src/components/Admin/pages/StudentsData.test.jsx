import { vi } from 'vitest';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import StudentsData from './StudentsData';
import { AUTH_REALM, startCookieSession } from '../../../utils/authStorage';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const studentEntry = {
  student: {
    _id: 's1',
    name: 'Aisha Khan',
    email: 'aisha@example.com',
    studentId: 'GR-001',
    createdAt: '2026-01-02T00:00:00.000Z',
  },
  enrollments: [
    {
      _id: 'e1',
      status: 'active',
      paymentStatus: 'pending',
      course: { _id: 'c1', title: 'Quran Basics', price: 40 },
    },
  ],
  parents: [],
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.pushState({}, '', '/admin/students');
  startCookieSession({ id: 'a1', role: 'manager', name: 'Admin' }, false, AUTH_REALM.ADMIN);
  Object.values(axios).forEach((fn) => fn.mockReset?.());
  axios.get.mockImplementation(async (url) => {
    const target = String(url);
    if (target.includes('/api/enrollments/students')) {
      return { data: { success: true, students: [studentEntry], totalStudents: 1, totalPages: 1 } };
    }
    if (target.includes('/api/courses')) {
      return { data: { success: true, courses: [] } };
    }
    return { data: { success: true } };
  });
});

describe('students list', () => {
  test('shows each student with their course', async () => {
    render(
      <MemoryRouter>
        <StudentsData />
      </MemoryRouter>
    );
    expect(await screen.findByText('Aisha Khan')).toBeInTheDocument();
    expect(screen.getByText(/Quran Basics/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /students/i })).toBeInTheDocument());
    const studentsCall = axios.get.mock.calls.find((call) => String(call[0]).includes('/api/enrollments/students'));
    expect(studentsCall?.[1]?.params?.status).toBe('active');
  });

  test('asks the API for the status chosen in the dropdown', async () => {
    render(
      <MemoryRouter>
        <StudentsData />
      </MemoryRouter>
    );
    const statusFilter = await screen.findByRole('combobox', { name: 'Filter by status' });
    expect(statusFilter).toHaveValue('active');
    await userEvent.selectOptions(statusFilter, 'paused');
    await waitFor(() => {
      const calls = axios.get.mock.calls.filter((call) => String(call[0]).includes('/api/enrollments/students'));
      expect(calls.at(-1)?.[1]?.params?.status).toBe('paused');
    });
    await waitFor(() => expect(screen.queryByText('Aisha Khan')).not.toBeInTheDocument());
  });
});
