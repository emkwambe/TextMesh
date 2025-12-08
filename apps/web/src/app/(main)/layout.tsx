'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useAuthStore } from '@/stores/authStore';
import { Avatar } from '@/components/ui/Avatar';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  HomeIcon,
  SearchIcon,
  BellIcon,
  MessageIcon,
  UserIcon,
  SettingsIcon,
  PlusIcon,
  LogOutIcon,
  TrendingIcon,
} from '@/components/icons';

interface MainLayoutProps {
  children: ReactNode;
}

const navItems = [
  { href: '/feed', label: 'Home', icon: HomeIcon },
  { href: '/explore', label: 'Explore', icon: SearchIcon },
  { href: '/notifications', label: 'Notifications', icon: BellIcon },
  { href: '/messages', label: 'Messages', icon: MessageIcon },
  { href: '/profile', label: 'Profile', icon: UserIcon },
];

export default function MainLayout({ children }: MainLayoutProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-20 xl:w-64 border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 flex flex-col z-20">
        {/* Logo */}
        <div className="p-4 xl:px-6">
          <Link href="/feed" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xl">T</span>
            </div>
            <span className="hidden xl:block font-display text-xl font-bold">TextMesh</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 xl:px-4 py-4">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={clsx(
                      'flex items-center gap-4 px-4 py-3 rounded-xl transition-colors',
                      isActive
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-medium'
                        : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    )}
                  >
                    <Icon className="w-6 h-6 flex-shrink-0" />
                    <span className="hidden xl:block">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Compose button */}
          <Link
            href="/compose"
            className="mt-6 flex items-center justify-center xl:justify-start gap-3 w-full px-4 py-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors font-medium"
          >
            <PlusIcon className="w-6 h-6 flex-shrink-0" />
            <span className="hidden xl:block">Post</span>
          </Link>
        </nav>

        {/* User menu */}
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <Avatar
              src={user?.avatar}
              alt={user?.displayName || 'User'}
              size="md"
            />
            <div className="hidden xl:block flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{user?.displayName}</p>
              <p className="text-neutral-500 text-sm truncate">@{user?.username}</p>
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-2 mt-4">
            <ThemeToggle />
            <Link
              href="/settings"
              className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
            >
              <SettingsIcon className="w-5 h-5" />
            </Link>
            <button
              onClick={logout}
              className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
            >
              <LogOutIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-20 xl:ml-64">
        <div className="max-w-2xl mx-auto border-x border-neutral-200 dark:border-neutral-800 min-h-screen">
          {children}
        </div>
      </main>

      {/* Right sidebar */}
      <aside className="hidden lg:block fixed right-0 top-0 bottom-0 w-80 xl:w-96 border-l border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Search */}
          <div className="relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
            <input
              type="search"
              placeholder="Search TextMesh"
              className="w-full pl-12 pr-4 py-3 rounded-full bg-neutral-100 dark:bg-neutral-800 border-0 focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>

          {/* Trending */}
          <div className="card p-4">
            <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
              <TrendingIcon className="w-5 h-5 text-primary-500" />
              Trending
            </h3>
            <div className="space-y-4">
              {['#TextMesh', '#TechNews', '#Thoughts', '#Community', '#Ideas'].map((tag) => (
                <Link
                  key={tag}
                  href={`/explore?q=${encodeURIComponent(tag)}`}
                  className="block group"
                >
                  <p className="font-medium group-hover:text-primary-500 transition-colors">{tag}</p>
                  <p className="text-sm text-neutral-500">{Math.floor(Math.random() * 50 + 10)}K posts</p>
                </Link>
              ))}
            </div>
            <Link href="/explore" className="block text-primary-500 text-sm mt-4 hover:underline">
              Show more
            </Link>
          </div>

          {/* Who to follow */}
          <div className="card p-4">
            <h3 className="font-display font-bold text-lg mb-4">Who to follow</h3>
            <div className="space-y-4">
              {[
                { name: 'Sarah Chen', username: 'sarahc', verified: true },
                { name: 'Alex Rivera', username: 'alexr', verified: false },
                { name: 'Jordan Lee', username: 'jlee', verified: true },
              ].map((user) => (
                <div key={user.username} className="flex items-center gap-3">
                  <Avatar src={null} alt={user.name} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate flex items-center gap-1">
                      {user.name}
                      {user.verified && (
                        <svg className="w-4 h-4 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </p>
                    <p className="text-neutral-500 text-sm truncate">@{user.username}</p>
                  </div>
                  <button className="btn-primary btn-sm">Follow</button>
                </div>
              ))}
            </div>
            <Link href="/explore/people" className="block text-primary-500 text-sm mt-4 hover:underline">
              Show more
            </Link>
          </div>

          {/* Footer */}
          <footer className="text-xs text-neutral-400 space-x-2">
            <Link href="/terms" className="hover:underline">Terms</Link>
            <Link href="/privacy" className="hover:underline">Privacy</Link>
            <Link href="/about" className="hover:underline">About</Link>
            <span>&copy; {new Date().getFullYear()} TextMesh</span>
          </footer>
        </div>
      </aside>
    </div>
  );
}
