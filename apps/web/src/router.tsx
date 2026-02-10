import { createBrowserRouter } from 'react-router-dom';
import { ProtectedLayout } from './components/auth/ProtectedLayout';
import { Dashboard } from './pages/Dashboard';
import { Movies } from './pages/Movies';
import { Series } from './pages/Series';
import { SeriesDetail } from './pages/SeriesDetail';
import { Books } from './pages/Books';
import { Games } from './pages/Games';
import { Approvals } from './pages/Approvals';
import { Downloads } from './pages/Downloads';
import { Calendar } from './pages/Calendar';
import { Search } from './pages/Search';
import { Discover } from './pages/Discover';
import { Tdarr } from './pages/Tdarr';
import { Settings } from './pages/Settings';
import { Stats } from './pages/Stats';
import { Login } from './pages/Login';
import { Logs } from './pages/Logs';
import { PlexCallback } from './pages/PlexCallback';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/auth/plex/callback',
    element: <PlexCallback />,
  },
  {
    path: '/',
    element: <ProtectedLayout />,
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: 'movies',
        element: <Movies />,
      },
      {
        path: 'series',
        element: <Series />,
      },
      {
        path: 'series/:id',
        element: <SeriesDetail />,
      },
      {
        path: 'books',
        element: <Books />,
      },
      {
        path: 'games',
        element: <Games />,
      },
      {
        path: 'approvals',
        element: <Approvals />,
      },
      {
        path: 'downloads',
        element: <Downloads />,
      },
      {
        path: 'logs',
        element: <Logs />,
      },
      {
        path: 'calendar',
        element: <Calendar />,
      },
      {
        path: 'search',
        element: <Search />,
      },
      {
        path: 'discover',
        element: <Discover />,
      },
      {
        path: 'tdarr',
        element: <Tdarr />,
      },
      {
        path: 'settings',
        element: <Settings />,
      },
      {
        path: 'stats',
        element: <Stats />,
      },
    ],
  },
]);
