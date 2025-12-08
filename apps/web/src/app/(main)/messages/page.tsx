'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { SearchIcon, PlusIcon, MessageIcon } from '@/components/icons';
import { formatDistanceToNow } from 'date-fns';

interface Conversation {
  id: string;
  participant: {
    id: string;
    username: string;
    displayName: string;
    avatar?: string;
    isVerified: boolean;
    isOnline: boolean;
  };
  lastMessage: {
    content: string;
    timestamp: string;
    isRead: boolean;
    isSentByMe: boolean;
  };
}

export default function MessagesPage() {
  const [searchQuery, setSearchQuery] = useState('');

  // Mock conversations
  const conversations: Conversation[] = [
    {
      id: '1',
      participant: {
        id: '1',
        username: 'sarahc',
        displayName: 'Sarah Chen',
        isVerified: true,
        isOnline: true,
      },
      lastMessage: {
        content: 'That sounds great! Let me know when you are free.',
        timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        isRead: false,
        isSentByMe: false,
      },
    },
    {
      id: '2',
      participant: {
        id: '2',
        username: 'alexr',
        displayName: 'Alex Rivera',
        isVerified: false,
        isOnline: false,
      },
      lastMessage: {
        content: 'Thanks for sharing the article!',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        isRead: true,
        isSentByMe: true,
      },
    },
    {
      id: '3',
      participant: {
        id: '3',
        username: 'jlee',
        displayName: 'Jordan Lee',
        isVerified: true,
        isOnline: true,
      },
      lastMessage: {
        content: 'Looking forward to the collaboration!',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        isRead: true,
        isSentByMe: false,
      },
    },
  ];

  const filteredConversations = searchQuery
    ? conversations.filter(
        (c) =>
          c.participant.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.participant.username.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 glass border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display font-bold text-xl">Messages</h1>
          <button className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-primary-500">
            <PlusIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Direct Messages"
            className="w-full pl-10 pr-4 py-2 rounded-full bg-neutral-100 dark:bg-neutral-800 border-0 focus:ring-2 focus:ring-primary-500 text-sm"
          />
        </div>
      </header>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="py-16 text-center px-4">
            <div className="w-16 h-16 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageIcon className="w-8 h-8 text-neutral-400" />
            </div>
            {searchQuery ? (
              <>
                <p className="text-neutral-500 text-lg mb-2">No results found</p>
                <p className="text-neutral-400">
                  Try searching for a different name or username.
                </p>
              </>
            ) : (
              <>
                <p className="text-neutral-500 text-lg mb-2">No messages yet</p>
                <p className="text-neutral-400 mb-4">
                  Start a conversation by messaging someone!
                </p>
                <Button variant="primary">Start a message</Button>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {filteredConversations.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/messages/${conversation.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors"
              >
                <div className="relative">
                  <Avatar
                    src={conversation.participant.avatar}
                    alt={conversation.participant.displayName}
                    size="lg"
                  />
                  {conversation.participant.isOnline && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-success-500 rounded-full border-2 border-white dark:border-neutral-950" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="font-semibold truncate">
                      {conversation.participant.displayName}
                    </p>
                    {conversation.participant.isVerified && (
                      <svg className="w-4 h-4 text-primary-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                    <span className="text-neutral-400 text-sm flex-shrink-0">
                      · {formatDistanceToNow(new Date(conversation.lastMessage.timestamp), { addSuffix: false })}
                    </span>
                  </div>
                  <p
                    className={`text-sm truncate ${
                      !conversation.lastMessage.isRead && !conversation.lastMessage.isSentByMe
                        ? 'font-semibold text-neutral-900 dark:text-neutral-100'
                        : 'text-neutral-500'
                    }`}
                  >
                    {conversation.lastMessage.isSentByMe && 'You: '}
                    {conversation.lastMessage.content}
                  </p>
                </div>

                {!conversation.lastMessage.isRead && !conversation.lastMessage.isSentByMe && (
                  <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
