import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Courses from './pages/Courses';
import Roadmap from './pages/Roadmap';
import History from './pages/History';
import News from './pages/News';
import Settings from './pages/Settings';

const navItems = [
  { to: '/', label: 'Dashboard', exact: true },
  { to: '/courses', label: 'Courses' },
  { to: '/roadmap', label: 'Roadmap' },
  { to: '/history', label: 'History' },
  { to: '/news', label: 'News' },
  { to: '/settings', label: 'Settings' },
];

function AppLayout() {
  const location = useLocation();
  const isCourses = location.pathname === '/courses';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="bg-slate-900 text-white px-6 py-3 flex items-center gap-6 shrink-0">
        <span className="font-bold text-lg mr-4">Daily Push</span>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) =>
              `text-sm font-medium transition-colors ${isActive ? 'text-sky-400' : 'text-slate-300 hover:text-white'}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      {isCourses ? (
        <Routes>
          <Route path="/courses" element={<Courses />} />
        </Routes>
      ) : (
        <main className="max-w-3xl mx-auto px-4 py-8 w-full">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/roadmap" element={<Roadmap />} />
            <Route path="/history" element={<History />} />
            <Route path="/news" element={<News />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
