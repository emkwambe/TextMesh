'use client';

import { useState } from 'react';
import Image from 'next/image';
import clsx from 'clsx';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface AvatarProps {
  src?: string | null;
  alt: string;
  size?: AvatarSize;
  className?: string;
  onClick?: () => void;
}

const sizeStyles: Record<AvatarSize, { container: string; text: string; pixels: number }> = {
  xs: { container: 'w-6 h-6', text: 'text-xs', pixels: 24 },
  sm: { container: 'w-8 h-8', text: 'text-sm', pixels: 32 },
  md: { container: 'w-10 h-10', text: 'text-base', pixels: 40 },
  lg: { container: 'w-14 h-14', text: 'text-lg', pixels: 56 },
  xl: { container: 'w-20 h-20', text: 'text-xl', pixels: 80 },
  '2xl': { container: 'w-28 h-28', text: 'text-2xl', pixels: 112 },
};

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function getAvatarColor(name: string): string {
  const colors = [
    'bg-primary-500',
    'bg-secondary-500',
    'bg-accent-500',
    'bg-success-500',
    'bg-warning-500',
    'bg-error-500',
  ];
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

export function Avatar({ src, alt, size = 'md', className, onClick }: AvatarProps) {
  const [imageError, setImageError] = useState(false);
  const { container, text, pixels } = sizeStyles[size];
  const showImage = src && !imageError;

  return (
    <div
      className={clsx(
        'relative inline-flex items-center justify-center rounded-full overflow-hidden',
        container,
        !showImage && getAvatarColor(alt),
        onClick && 'cursor-pointer hover:opacity-90 transition-opacity',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {showImage ? (
        <Image
          src={src}
          alt={alt}
          width={pixels}
          height={pixels}
          className="object-cover w-full h-full"
          onError={() => setImageError(true)}
        />
      ) : (
        <span className={clsx('font-medium text-white', text)}>
          {getInitials(alt)}
        </span>
      )}
    </div>
  );
}
