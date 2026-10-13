import { vi } from 'vitest';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeacherAttendance from './TeacherAttendance';
import { portalGet, portalPost } from '../shared/portalApi';

vi.mock('../shared/portalApi', () => ({
  portalGet: vi.fn(),
  portalPost: vi.fn(),
  portalPatch: vi.fn(),
  portalDelete: vi.fn(),
}));

const roster = [
  { _id: 's1', name: 'Aisha Khan', rollNumber: 'GR-001', record: null },
  { _id: 's2', name: 'Omar Ali', rollNumber: 'GR-002', record: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  portalGet.mockImplementation(async (url) => {
    if (url.startsWith('/teacher/courses')) {
      return { success: true, courses: [{ _id: 'c1', title: 'Quran Basics' }] };
    }
    if (url.startsWith('/teacher/attendance/roster')) {
      return { success: true, students: roster, count: roster.length };
    }
    if (url.startsWith('/teacher/attendance/view')) {
      return { success: true, rows: [], records: [] };
    }
    return { success: true };
  });
  portalPost.mockResolvedValue({ success: true });
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/teacher/attendance?course=c1']}>
      <TeacherAttendance />
    </MemoryRouter>
  );
}

describe('teacher attendance page', () => {
  test('lists the class roster for the chosen course', async () => {
    renderPage();
    expect(await screen.findByText(/Aisha Khan/)).toBeInTheDocument();
    expect(screen.getByText(/Omar Ali/)).toBeInTheDocument();
  });

  test('saving sends one mark per student', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/Aisha Khan/);
    await user.click(screen.getAllByRole('button', { name: /save/i })[0]);
    await waitFor(() => expect(portalPost).toHaveBeenCalled());
    const [url, body] = portalPost.mock.calls[0];
    expect(url).toBe('/teacher/attendance');
    expect(JSON.stringify(body)).toContain('s1');
    expect(JSON.stringify(body)).toContain('s2');
  });
});
