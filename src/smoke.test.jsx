import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import HeroSection from './components/HomeSections/Hero';
import { SingleCourse } from './components/Pages/SingleCourse';
import Login from './components/Pages/Login';
import PaymentGateway from './components/Admin/pages/PaymentGateway';
import { CurrencyProvider } from './context/CurrencyContext';

jest.mock('axios', () => ({
  post: jest.fn(),
}));

function jsonResponse(body, ok = true) {
  return {
    ok,
    json: async () => body,
  };
}

describe('public smoke checks', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    axios.post.mockReset();
    global.fetch = jest.fn(async (url) => {
      const target = String(url);
      if (target.includes('/api/courses/public')) {
        return jsonResponse({
          success: true,
          courses: [{ _id: 'course-1', title: 'Nazrah', slug: 'nazrah', price: 30, isPublished: true }],
        });
      }
      if (target.includes('/api/courses/nazrah')) {
        return jsonResponse({
          success: true,
          course: { _id: 'course-1', title: 'Nazrah', slug: 'nazrah', price: 30, description: 'Reading course' },
        });
      }
      if (target.includes('/api/payments/bank-details')) {
        return jsonResponse({
          success: true,
          bankDetails: { bankName: 'Test Bank', accountName: 'Gorythm' },
        });
      }
      if (target.includes('er-api.com') || target.includes('exchangerate-api.com')) {
        return jsonResponse({ rates: { USD: 1 } });
      }
      return jsonResponse({}, false);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('home page renders', () => {
    render(<HeroSection />);
    expect(screen.getByText('YOU ARE BUILT WITH')).toBeInTheDocument();
    expect(screen.getByText('SIGNS')).toBeInTheDocument();
  });

  test('course page shows a price', async () => {
    render(
      <CurrencyProvider>
        <MemoryRouter initialEntries={['/courses/nazrah']}>
          <Routes>
            <Route path="/courses/:slug" element={<SingleCourse />} />
          </Routes>
        </MemoryRouter>
      </CurrencyProvider>
    );

    expect(await screen.findByText('Nazrah')).toBeInTheDocument();
    expect(await screen.findByText(/\$30/)).toBeInTheDocument();
  });

  test('payment form checks input', async () => {
    const user = userEvent.setup();
    render(
      <CurrencyProvider>
        <MemoryRouter initialEntries={['/payment']}>
          <PaymentGateway />
        </MemoryRouter>
      </CurrencyProvider>
    );

    await user.click(await screen.findByRole('button', { name: /bank transfer/i }));
    await user.click(screen.getByRole('button', { name: /submit bank payment/i }));

    expect(await screen.findByText('Please enter the student full name.')).toBeInTheDocument();
    expect(screen.getByText('Please enter your email address.')).toBeInTheDocument();
  });

  test('login sends a student to the student home', async () => {
    axios.post.mockResolvedValue({
      data: {
        token: 'test-token',
        user: {
          role: 'student',
          name: 'Amina',
          email: 'amina@example.com',
          mustChangePassword: false,
        },
      },
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/student" element={<h1>Student home</h1>} />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/email/i), 'amina@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'secret-pass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('heading', { name: 'Student home' })).toBeInTheDocument();
  });

  test('failed login stays on the login page', async () => {
    axios.post.mockRejectedValue({ response: { data: { error: 'Authentication failed' } } });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/student" element={<h1>Student home</h1>} />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/email/i), 'amina@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'wrong-pass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Authentication failed')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Student home' })).not.toBeInTheDocument();
    });
  });
});
