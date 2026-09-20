import { useState, useEffect, useRef } from 'react';
import { Search, Bell, ChevronDown } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/utils';
import type { ActivityLog } from '@/lib/supabase';

interface TopbarProps {
  onSearch?: (query: string) => void;
}

export default function Topbar({ onSearch }: TopbarProps) {
  const { user, signOut } = useAuth();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchNotifs = async () => {
      const { data } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      setRecentActivity((data || []) as ActivityLog[]);
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false);
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="h-16 bg-primary-900/80 backdrop-blur-md border-b border-primary-800 flex items-center gap-4 px-4 lg:px-6 sticky top-0 z-30">
      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              onSearch?.(e.target.value);
            }}
            placeholder="Search..."
            className="input pl-10 py-2"
          />
        </div>
      </div>

      {/* Notifications */}
      <div className="relative" ref={notifRef}>
        <button
          onClick={() => setShowNotifs(!showNotifs)}
          className="relative p-2 rounded-lg text-gray-400 hover:text-white hover:bg-primary-800 transition-colors"
        >
          <Bell className="w-5 h-5" />
          {recentActivity.length > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent-500 ring-2 ring-primary-900" />
          )}
        </button>

        {showNotifs && (
          <div className="absolute right-0 mt-2 w-80 card p-0 overflow-hidden animate-slide-up z-50">
            <div className="px-4 py-3 border-b border-primary-800">
              <p className="text-sm font-semibold text-white">Recent Activity</p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {recentActivity.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-500 text-center">No recent activity</p>
              ) : (
                recentActivity.map((a) => (
                  <div key={a.id} className="px-4 py-3 border-b border-primary-800/50 hover:bg-primary-800/30 transition-colors">
                    <p className="text-sm text-gray-300">
                      <span className="font-medium text-accent-400">{a.user_name}</span> {a.action}
                    </p>
                    {a.target && <p className="text-xs text-gray-500 mt-0.5">{a.target}</p>}
                    <p className="text-xs text-gray-600 mt-0.5">{timeAgo(a.created_at)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* User menu */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2.5 p-1 pr-2 rounded-lg hover:bg-primary-800 transition-colors"
        >
          <div className="w-9 h-9 rounded-full bg-accent-500/20 flex items-center justify-center text-accent-400 font-semibold text-sm">
            {user?.name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-medium text-white leading-tight">{user?.name}</p>
            <p className="text-xs text-gray-500 capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-500 hidden sm:block" />
        </button>

        {showMenu && (
          <div className="absolute right-0 mt-2 w-56 card p-2 animate-slide-up z-50">
            <div className="px-3 py-2 border-b border-primary-800 mb-1">
              <p className="text-sm font-medium text-white">{user?.name}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
            <button
              onClick={signOut}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-error-400 hover:bg-error-500/10 transition-colors"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
