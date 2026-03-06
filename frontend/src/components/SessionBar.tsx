'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiLogout } from '@/lib/auth';
import { DarkModeToggle } from '@/components/DarkModeToggle';

export default function SessionBar() {
  const router = useRouter();
  const { session, logout } = useAuth();

  if (!session) return null;

  const handleLogout = () => {
    apiLogout(session.token).catch(() => {}); // Best-effort, fire-and-forget
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
        className="text-sm px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-am-orange-400 hover:text-am-orange-600 dark:hover:text-am-orange-400 transition-colors"
      >
        Logout
      </button>
    </div>
  );
}
