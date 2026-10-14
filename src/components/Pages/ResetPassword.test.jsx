import { vi } from 'vitest';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import ResetPassword from './ResetPassword';

vi.mock('axios', () => ({
    default: {
        post: vi.fn(),
    },
}));

function renderReset(token = 'reset-token') {
    const path = token ? `/reset-password?token=${token}` : '/reset-password';
    return render(
        <MemoryRouter initialEntries={[path]}>
            <ResetPassword />
        </MemoryRouter>
    );
}

describe('ResetPassword', () => {
    beforeEach(() => {
        axios.post.mockReset();
    });

    test('shows the password form and username note before a password is saved', () => {
        renderReset();

        expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();
        expect(screen.getByText(/username from your academy email/i)).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Password updated' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Admin sign in' })).not.toBeInTheDocument();
    });

    test('replaces the form with one sign-in message after the password is saved', async () => {
        axios.post.mockResolvedValue({
            data: {
                success: true,
                message: 'Password updated. Sign in with the username from your academy email, not the inbox that received this link.',
            },
        });
        const user = userEvent.setup();
        renderReset();

        await user.type(screen.getByLabelText(/new password/i), 'new-password');
        await user.type(screen.getByLabelText(/confirm password/i), 'new-password');
        await user.click(screen.getByRole('button', { name: 'Update password' }));

        expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeInTheDocument();
        expect(document.title).toBe('Password updated | Gorythm Academy');
        expect(screen.queryByRole('heading', { name: 'Choose a new password' })).not.toBeInTheDocument();
        expect(screen.getByText('Sign in with the username from your academy email, not the inbox that received this link.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
        expect(screen.queryByRole('link', { name: 'Admin sign in' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Portal sign in' })).not.toBeInTheDocument();
    });

    test('does not offer sign in when the account is not active yet', async () => {
        axios.post.mockResolvedValue({
            data: {
                success: true,
                message: 'Password updated. You can sign in once the academy sets this account to Active.',
            },
        });
        const user = userEvent.setup();
        renderReset();

        await user.type(screen.getByLabelText(/new password/i), 'new-password');
        await user.type(screen.getByLabelText(/confirm password/i), 'new-password');
        await user.click(screen.getByRole('button', { name: 'Update password' }));

        expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeInTheDocument();
        expect(screen.getByText('You can sign in once the academy sets this account to Active.')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    });

    test('keeps the form when the reset link is rejected', async () => {
        axios.post.mockRejectedValue({
            response: { data: { error: 'This reset link is not valid or has expired.' } },
        });
        const user = userEvent.setup();
        renderReset();

        await user.type(screen.getByLabelText(/new password/i), 'new-password');
        await user.type(screen.getByLabelText(/confirm password/i), 'new-password');
        await user.click(screen.getByRole('button', { name: 'Update password' }));

        expect(await screen.findByText('This reset link is not valid or has expired.')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.queryByRole('heading', { name: 'Password updated' })).not.toBeInTheDocument();
        });
    });
});
