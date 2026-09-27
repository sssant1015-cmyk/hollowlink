import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './api/AuthContext';
import { ToastProvider } from './utils/toast';
import { CustomizationProvider } from './customization/CustomizationProvider';
import { ExtensionsProvider } from './extensions/ExtensionsProvider';
import { Layout } from './components/layout/Layout';
import { Spinner } from './components/ui/Ui';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const FeedPage = lazy(() => import('./pages/FeedPage').then((m) => ({ default: m.FeedPage })));
const FriendsPage = lazy(() => import('./pages/FriendsPage').then((m) => ({ default: m.FriendsPage })));
const GroupsPage = lazy(() => import('./pages/GroupsPage').then((m) => ({ default: m.GroupsPage })));
const GroupDetailPage = lazy(() => import('./pages/GroupDetailPage').then((m) => ({ default: m.GroupDetailPage })));
const ChatPage = lazy(() => import('./pages/ChatPage').then((m) => ({ default: m.ChatPage })));
const GroupChatPage = lazy(() => import('./pages/ChatPage').then((m) => ({ default: m.GroupChatPage })));
const EventsPage = lazy(() => import('./pages/EventsPage').then((m) => ({ default: m.EventsPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SearchPage = lazy(() => import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const ExtensionsPage = lazy(() => import('./pages/ExtensionsPage').then((m) => ({ default: m.ExtensionsPage })));
const AppearancePage = lazy(() => import('./pages/AppearancePage').then((m) => ({ default: m.AppearancePage })));
const ExtensionPanelRoute = lazy(() => import('./pages/ExtensionPanelRoute').then((m) => ({ default: m.ExtensionPanelRoute })));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
        <Spinner />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <CustomizationProvider>
      <AuthProvider>
        <ExtensionsProvider>
        <ToastProvider>
          <Suspense
            fallback={
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
                <Spinner />
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
              <Route path="/register" element={<RedirectIfAuthed><RegisterPage /></RedirectIfAuthed>} />
              <Route
                path="/app"
                element={
                  <RequireAuth>
                    <Layout />
                  </RequireAuth>
                }
              >
                <Route index element={<HomePage />} />
                <Route path="feed" element={<FeedPage />} />
                <Route path="friends" element={<FriendsPage />} />
                <Route path="groups" element={<GroupsPage />} />
                <Route path="groups/:id" element={<GroupDetailPage />} />
                <Route path="chat" element={<ChatPage />} />
                <Route path="chat/group/:groupId" element={<GroupChatPage />} />
                <Route path="chat/:id" element={<ChatPage />} />
                <Route path="events" element={<EventsPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="profile/:id" element={<ProfilePage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="settings/appearance" element={<AppearancePage />} />
                <Route path="extensions" element={<ExtensionsPage />} />
                <Route path="extensions/:extensionId" element={<ExtensionPanelRoute />} />
                <Route path="search" element={<SearchPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ToastProvider>
        </ExtensionsProvider>
      </AuthProvider>
      </CustomizationProvider>
    </BrowserRouter>
  );
}
