import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../src/api/AuthContext';
import { ToastProvider } from '../src/utils/toast';

function envelope(data: unknown) {
  return new Response(JSON.stringify({ success: true, data, error: null }), { status: 200 });
}

function stubSignedIn() {
  return vi.fn(async (url: string) => {
    const path = String(url);
    if (path.includes('/auth/me')) {
      return envelope({ user: { id: 'u_me', username: 'neo', displayName: 'Neo', role: 'user', avatarUrl: null, email: 'neo@x', bio: '', privacyProfile: 'friends', privacyPresence: 'friends', emailVerified: true, createdAt: '2026-01-01T00:00:00Z', status: 'online', customStatus: null, pronouns: null, location: null } });
    }
    return envelope({ items: [], total: 0, unread: 0, incoming: [], outgoing: [] });
  });
}

function renderWithProviders(ui: React.ReactElement, initialPath = '/app/feed') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="*" element={ui} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', stubSignedIn());
});

describe('FeedPage', () => {
  it('shows the empty state when there are no posts', async () => {
    const { FeedPage } = await import('../src/pages/FeedPage');
    renderWithProviders(<FeedPage />);
    await waitFor(() => expect(screen.getByText(/Your feed is empty/i)).toBeInTheDocument());
  });

  it('renders the composer for signed-in users', async () => {
    const { FeedPage } = await import('../src/pages/FeedPage');
    renderWithProviders(<FeedPage />);
    await waitFor(() => expect(screen.getByLabelText(/Compose a post/i)).toBeInTheDocument());
  });
});

describe('FriendsPage', () => {
  it('renders tabs and empty friends state', async () => {
    const { FriendsPage } = await import('../src/pages/FriendsPage');
    renderWithProviders(<FriendsPage />);
    await waitFor(() => expect(screen.getByText(/No friends yet/i)).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /Find people/i })).toBeInTheDocument();
  });
});

describe('ChatPage', () => {
  it('shows the empty conversation panel', async () => {
    const { ChatPage } = await import('../src/pages/ChatPage');
    renderWithProviders(<ChatPage />, '/app/chat');
    await waitFor(() => expect(screen.getByText(/Select a conversation/i)).toBeInTheDocument());
  });
});
