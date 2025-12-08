'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { useFeedStore } from '@/stores/feedStore';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';

interface ComposeBoxProps {
  replyTo?: {
    id: string;
    author: {
      username: string;
    };
  };
  onSuccess?: () => void;
  autoFocus?: boolean;
}

const MAX_LENGTH = 500;

export function ComposeBox({ replyTo, onSuccess, autoFocus }: ComposeBoxProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const { addPost } = useFeedStore();
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= MAX_LENGTH) {
      setContent(value);
    }
    adjustTextareaHeight();
  };

  const handleSubmit = async () => {
    if (!content.trim() || isSubmitting) return;

    setIsSubmitting(true);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/api/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          content: content.trim(),
          replyToId: replyTo?.id,
        }),
      });

      if (!response.ok) throw new Error('Failed to create post');

      const data = await response.json();

      addPost(data.post);
      setContent('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }

      toast.success(replyTo ? 'Reply posted!' : 'Post created!');
      onSuccess?.();
    } catch (error) {
      toast.error('Failed to post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  const remainingChars = MAX_LENGTH - content.length;
  const isNearLimit = remainingChars <= 50;
  const isOverLimit = remainingChars < 0;

  if (!user) return null;

  return (
    <div className="px-4 py-3">
      {replyTo && (
        <p className="text-sm text-neutral-500 mb-2 ml-13">
          Replying to{' '}
          <span className="text-primary-500">@{replyTo.author.username}</span>
        </p>
      )}

      <div className="flex gap-3">
        <Avatar
          src={user.avatar}
          alt={user.displayName}
          size="md"
        />

        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={replyTo ? 'Post your reply' : "What's on your mind?"}
            className="w-full resize-none bg-transparent text-lg placeholder:text-neutral-400 focus:outline-none min-h-[80px]"
            rows={1}
          />

          <div className="flex items-center justify-between pt-3 border-t border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              {/* Could add emoji picker, gif picker, etc. */}
            </div>

            <div className="flex items-center gap-3">
              {content.length > 0 && (
                <div className="flex items-center gap-2">
                  <div
                    className={`w-5 h-5 rounded-full border-2 transition-colors ${
                      isOverLimit
                        ? 'border-error-500'
                        : isNearLimit
                        ? 'border-warning-500'
                        : 'border-neutral-300 dark:border-neutral-600'
                    }`}
                    style={{
                      background: `conic-gradient(${
                        isOverLimit
                          ? '#F50000'
                          : isNearLimit
                          ? '#FFC300'
                          : '#0066FF'
                      } ${Math.min((content.length / MAX_LENGTH) * 100, 100)}%, transparent 0)`,
                    }}
                  />
                  <span
                    className={`text-sm ${
                      isOverLimit
                        ? 'text-error-500'
                        : isNearLimit
                        ? 'text-warning-500'
                        : 'text-neutral-400'
                    }`}
                  >
                    {remainingChars}
                  </span>
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={!content.trim() || isOverLimit || isSubmitting}
                loading={isSubmitting}
                size="sm"
              >
                {replyTo ? 'Reply' : 'Post'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
