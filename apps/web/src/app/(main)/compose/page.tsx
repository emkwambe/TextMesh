'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { useFeedStore } from '@/stores/feedStore';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { XIcon } from '@/components/icons';

const MAX_LENGTH = 500;

export default function ComposePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { addPost } = useFeedStore();
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim() || isSubmitting) return;

    setIsSubmitting(true);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({ content: content.trim() }),
      });

      if (!response.ok) throw new Error('Failed to create post');

      const data = await response.json();
      addPost(data.post);

      toast.success('Post created!');
      router.push('/feed');
    } catch (error) {
      toast.error('Failed to post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const remainingChars = MAX_LENGTH - content.length;
  const isNearLimit = remainingChars <= 50;
  const isOverLimit = remainingChars < 0;
  const progress = Math.min((content.length / MAX_LENGTH) * 100, 100);

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 glass border-b border-neutral-200 dark:border-neutral-800 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <XIcon className="w-5 h-5" />
        </button>

        <Button
          onClick={handleSubmit}
          disabled={!content.trim() || isOverLimit || isSubmitting}
          loading={isSubmitting}
          size="sm"
        >
          Post
        </Button>
      </header>

      {/* Compose area */}
      <div className="flex-1 p-4">
        <div className="flex gap-3">
          <Avatar src={user.avatar} alt={user.displayName} size="lg" />

          <div className="flex-1">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, MAX_LENGTH + 50))}
              placeholder="What's happening?"
              className="w-full resize-none bg-transparent text-xl placeholder:text-neutral-400 focus:outline-none min-h-[200px]"
              autoFocus
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="sticky bottom-0 glass border-t border-neutral-200 dark:border-neutral-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Future: Add media, emoji, poll buttons */}
          </div>

          <div className="flex items-center gap-3">
            {content.length > 0 && (
              <>
                <div className="w-8 h-8 relative">
                  <svg className="w-8 h-8 transform -rotate-90">
                    <circle
                      cx="16"
                      cy="16"
                      r="14"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                      className="text-neutral-200 dark:text-neutral-700"
                    />
                    <circle
                      cx="16"
                      cy="16"
                      r="14"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                      strokeDasharray={`${2 * Math.PI * 14}`}
                      strokeDashoffset={`${2 * Math.PI * 14 * (1 - progress / 100)}`}
                      className={
                        isOverLimit
                          ? 'text-error-500'
                          : isNearLimit
                          ? 'text-warning-500'
                          : 'text-primary-500'
                      }
                      strokeLinecap="round"
                    />
                  </svg>
                  {isNearLimit && (
                    <span
                      className={`absolute inset-0 flex items-center justify-center text-xs font-medium ${
                        isOverLimit ? 'text-error-500' : 'text-warning-500'
                      }`}
                    >
                      {remainingChars}
                    </span>
                  )}
                </div>

                <div className="w-px h-6 bg-neutral-200 dark:bg-neutral-700" />
              </>
            )}

            <Button
              onClick={handleSubmit}
              disabled={!content.trim() || isOverLimit || isSubmitting}
              loading={isSubmitting}
            >
              Post
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
