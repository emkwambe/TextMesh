'use client';

import { forwardRef, InputHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, prefix, suffix, className, id, ...props }, ref) => {
    const inputId = id || props.name;

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            {label}
          </label>
        )}

        <div className="relative">
          {prefix && (
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">
              {prefix}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            className={clsx(
              'w-full px-4 py-3 rounded-xl border',
              'bg-white dark:bg-neutral-800',
              'text-neutral-900 dark:text-neutral-100',
              'placeholder:text-neutral-400 dark:placeholder:text-neutral-500',
              'focus:outline-none focus:ring-2 focus:border-transparent',
              'transition-all duration-200',
              error
                ? 'border-error-500 focus:ring-error-500'
                : 'border-neutral-200 dark:border-neutral-700 focus:ring-primary-500',
              prefix && 'pl-8',
              suffix && 'pr-10',
              className
            )}
            {...props}
          />

          {suffix && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400">
              {suffix}
            </span>
          )}
        </div>

        {(error || hint) && (
          <p
            className={clsx(
              'text-sm',
              error ? 'text-error-500' : 'text-neutral-500'
            )}
          >
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
