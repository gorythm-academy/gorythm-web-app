import { vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import PromoVideosManagement from './PromoVideosManagement';
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

const video = {
  id: 'v1',
  name: 'Welcome Promo',
  provider: 'youtube',
  videoId: 'dQw4w9WgXcQ',
  videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  thumbnailPath: '',
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.pushState({}, '', '/admin/videos');
  startCookieSession({ id: 'a1', role: 'manager', name: 'Admin' }, false, AUTH_REALM.ADMIN);
  Object.values(axios).forEach((fn) => fn.mockReset?.());
  axios.get.mockImplementation(async (url) => {
    if (String(url).includes('/api/admin/promo-videos')) {
      return {
        data: {
          videos: [video],
          activeVideos: [video],
          trashCount: 0,
          selection: { homepageVideoId: 'v1', aboutVideoId: '' },
        },
      };
    }
    return { data: { success: true, images: [] } };
  });
});

describe('promo videos', () => {
  test('lists the saved video and opens the add form', async () => {
    render(<PromoVideosManagement />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: /video controls/i })).toBeInTheDocument()
    );
    expect((await screen.findAllByText('Welcome Promo')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /add video/i })).toBeInTheDocument();
  });
});
