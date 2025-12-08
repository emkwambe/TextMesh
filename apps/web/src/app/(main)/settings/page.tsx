'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/components/ThemeProvider';
import {
  UserIcon,
  BellIcon,
  SettingsIcon,
  SunIcon,
  MoonIcon,
  LogOutIcon,
} from '@/components/icons';
import clsx from 'clsx';

interface SettingSection {
  title: string;
  items: SettingItem[];
}

interface SettingItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description?: string;
  href?: string;
  action?: () => void;
  toggle?: boolean;
  toggleValue?: boolean;
  onToggle?: () => void;
  danger?: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const { logout } = useAuthStore();
  const { resolvedTheme, setTheme } = useTheme();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const sections: SettingSection[] = [
    {
      title: 'Account',
      items: [
        {
          icon: UserIcon,
          label: 'Profile',
          description: 'Edit your profile information',
          href: '/settings/profile',
        },
        {
          icon: SettingsIcon,
          label: 'Account Settings',
          description: 'Password, email, and security',
          href: '/settings/account',
        },
      ],
    },
    {
      title: 'Preferences',
      items: [
        {
          icon: resolvedTheme === 'dark' ? SunIcon : MoonIcon,
          label: 'Dark Mode',
          description: `Currently ${resolvedTheme === 'dark' ? 'on' : 'off'}`,
          toggle: true,
          toggleValue: resolvedTheme === 'dark',
          onToggle: toggleTheme,
        },
        {
          icon: BellIcon,
          label: 'Notifications',
          description: 'Manage notification preferences',
          href: '/settings/notifications',
        },
      ],
    },
    {
      title: 'Other',
      items: [
        {
          icon: LogOutIcon,
          label: 'Log out',
          description: 'Sign out of your account',
          action: handleLogout,
          danger: true,
        },
      ],
    },
  ];

  return (
    <div>
      {/* Header */}
      <header className="sticky top-0 z-10 glass border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
        <h1 className="font-display font-bold text-xl">Settings</h1>
      </header>

      {/* Settings sections */}
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {sections.map((section) => (
          <div key={section.title} className="py-4">
            <h2 className="px-4 text-sm font-medium text-neutral-500 mb-2">
              {section.title}
            </h2>
            <div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const content = (
                  <div className="flex items-center gap-4 px-4 py-3">
                    <div
                      className={clsx(
                        'w-10 h-10 rounded-full flex items-center justify-center',
                        item.danger
                          ? 'bg-error-100 dark:bg-error-900/30 text-error-500'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                      )}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={clsx(
                          'font-medium',
                          item.danger && 'text-error-500'
                        )}
                      >
                        {item.label}
                      </p>
                      {item.description && (
                        <p className="text-sm text-neutral-500">{item.description}</p>
                      )}
                    </div>
                    {item.toggle && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          item.onToggle?.();
                        }}
                        className={clsx(
                          'w-12 h-7 rounded-full relative transition-colors',
                          item.toggleValue
                            ? 'bg-primary-500'
                            : 'bg-neutral-300 dark:bg-neutral-600'
                        )}
                      >
                        <div
                          className={clsx(
                            'w-5 h-5 rounded-full bg-white absolute top-1 transition-transform',
                            item.toggleValue ? 'right-1' : 'left-1'
                          )}
                        />
                      </button>
                    )}
                    {!item.toggle && !item.action && (
                      <svg
                        className="w-5 h-5 text-neutral-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    )}
                  </div>
                );

                if (item.href) {
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="block hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors"
                    >
                      {content}
                    </Link>
                  );
                }

                if (item.action) {
                  return (
                    <button
                      key={item.label}
                      onClick={item.action}
                      className="w-full text-left hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors"
                    >
                      {content}
                    </button>
                  );
                }

                return (
                  <div
                    key={item.label}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors cursor-pointer"
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* App info */}
      <div className="px-4 py-8 text-center text-sm text-neutral-400">
        <p>TextMesh v1.0.0</p>
        <p className="mt-1">
          <Link href="/terms" className="hover:underline">Terms</Link>
          {' · '}
          <Link href="/privacy" className="hover:underline">Privacy</Link>
          {' · '}
          <Link href="/about" className="hover:underline">About</Link>
        </p>
      </div>
    </div>
  );
}
