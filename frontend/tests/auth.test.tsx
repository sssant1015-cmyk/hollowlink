import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../src/api/AuthContext';

interface MockEnvelope {
  success: boolean;
  data: unknown;
  error: { code: string; message: string } | null;
}

function SessionProbe() {
  const { user, loading } = useAuth();
  if (loading) return <p>loading…</p>;
  return <p>{user ? `signed-in:${user.username}` : 'signed-out'}</p>;
}

beforeEach(() => {
  localStorage.clear();
});

describe('AuthContext', () => {
  it('reports signed-out when /auth/me fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ success: false, data: null, error: { code: 'UNAUTHORIZED', message: 'nope' } } satisfies MockEnvelope),
          { status: 401 },
        ),
      ),
    );
    render(
      <MemoryRouter>
        <AuthProvider>
          <SessionProbe />
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument());
  });

  it('reports signed-in when /auth/me succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes('/auth/me')) {
          return new Response(
            JSON.stringify({
              success: true,
              data: { user: { id: 'u1', username: 'neo', displayName: 'Neo', role: 'user', avatarUrl: null } },
              error: null,
            } satisfies MockEnvelope),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ success: true, data: null, error: null } satisfies MockEnvelope), { status: 200 });
      }),
    );
    render(
      <MemoryRouter>
        <AuthProvider>
          <SessionProbe />
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('signed-in:neo')).toBeInTheDocument());
  });
});

describe('LoginPage form', () => {
  it('submits credentials and shows server errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const path = String(url);
        if (path.includes('/auth/me')) {
          return new Response(
            JSON.stringify({ success: false, data: null, error: { code: 'UNAUTHORIZED', message: 'anon' } } satisfies MockEnvelope),
            { status: 401 },
          );
        }
        if (path.includes('/auth/login')) {
          return new Response(
            JSON.stringify({
              success: false,
              data: null,
              error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
            } satisfies MockEnvelope),
            { status: 401 },
          );
        }
        return new Response(JSON.stringify({ success: true, data: null, error: null } satisfies MockEnvelope), { status: 200 });
      }),
    );
    const { LoginPage } = await import('../src/pages/LoginPage');
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText('Username or email'), 'neo');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials'));
  });
});
