import React from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart3, Star, ArrowLeftRight, Moon, Sun } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const navItems = [
  { to: '/', icon: BarChart3, label: 'Portefeuille' },
  { to: '/favorites', icon: Star, label: 'Favorietenlijst' },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Transacties' },
];

export default function Layout({ children, darkMode, toggleDarkMode }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            <h1 className="text-lg font-bold tracking-tight">Stock Tracker</h1>
          </div>

          <nav className="flex items-center gap-1">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>

          <button onClick={toggleDarkMode} className="btn-icon" title="Toggle dark mode">
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
