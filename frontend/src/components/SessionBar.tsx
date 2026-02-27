'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiLogout } from '@/lib/auth';
import { DarkModeToggle } from '@/components/DarkModeToggle';

export default function SessionBar() {
  const router = useRouter();
  const { session, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!session) return null;

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await apiLogout(session.token);
    } catch {
      // Best-effort logout
    }
    logout();
    router.replace('/login');
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 gap-3">
      <span className="text-sm text-gray-600 dark:text-gray-400 font-mono flex-1">
        {session.user} @ {session.host}:{session.port}
      </span>
      <DarkModeToggle />
      <button
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="text-sm px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoggingOut ? 'Logging out…' : 'Logout'}
      </button>
    </div>
  );
}
