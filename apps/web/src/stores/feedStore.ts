import { create } from 'zustand';

export interface Post {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatar?: string;
    isVerified: boolean;
  };
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  isLiked: boolean;
  isBookmarked: boolean;
  isReposted: boolean;
  replyTo?: {
    id: string;
    author: {
      username: string;
    };
  };
}

interface FeedState {
  posts: Post[];
  isLoading: boolean;
  hasMore: boolean;
  cursor: string | null;
  feedType: 'for-you' | 'following';

  setFeedType: (type: 'for-you' | 'following') => void;
  fetchPosts: () => Promise<void>;
  fetchMorePosts: () => Promise<void>;
  addPost: (post: Post) => void;
  removePost: (postId: string) => void;
  toggleLike: (postId: string) => void;
  toggleBookmark: (postId: string) => void;
  toggleRepost: (postId: string) => void;
  refreshFeed: () => Promise<void>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const useFeedStore = create<FeedState>((set, get) => ({
  posts: [],
  isLoading: false,
  hasMore: true,
  cursor: null,
  feedType: 'for-you',

  setFeedType: (type) => {
    set({ feedType: type, posts: [], cursor: null, hasMore: true });
    get().fetchPosts();
  },

  fetchPosts: async () => {
    const { feedType, isLoading } = get();
    if (isLoading) return;

    set({ isLoading: true });

    try {
      const response = await fetch(`${API_URL}/api/feed/${feedType}?limit=20`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch feed');

      const data = await response.json();

      set({
        posts: data.posts,
        cursor: data.nextCursor,
        hasMore: !!data.nextCursor,
        isLoading: false,
      });
    } catch (error) {
      console.error('Feed fetch error:', error);
      set({ isLoading: false });
    }
  },

  fetchMorePosts: async () => {
    const { feedType, cursor, isLoading, hasMore } = get();
    if (isLoading || !hasMore || !cursor) return;

    set({ isLoading: true });

    try {
      const response = await fetch(
        `${API_URL}/api/feed/${feedType}?limit=20&cursor=${cursor}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch more posts');

      const data = await response.json();

      set((state) => ({
        posts: [...state.posts, ...data.posts],
        cursor: data.nextCursor,
        hasMore: !!data.nextCursor,
        isLoading: false,
      }));
    } catch (error) {
      console.error('Fetch more error:', error);
      set({ isLoading: false });
    }
  },

  addPost: (post) => {
    set((state) => ({
      posts: [post, ...state.posts],
    }));
  },

  removePost: (postId) => {
    set((state) => ({
      posts: state.posts.filter((p) => p.id !== postId),
    }));
  },

  toggleLike: async (postId) => {
    const post = get().posts.find((p) => p.id === postId);
    if (!post) return;

    // Optimistic update
    set((state) => ({
      posts: state.posts.map((p) =>
        p.id === postId
          ? {
              ...p,
              isLiked: !p.isLiked,
              likesCount: p.isLiked ? p.likesCount - 1 : p.likesCount + 1,
            }
          : p
      ),
    }));

    try {
      const method = post.isLiked ? 'DELETE' : 'POST';
      await fetch(`${API_URL}/api/posts/${postId}/like`, {
        method,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });
    } catch (error) {
      // Revert on error
      set((state) => ({
        posts: state.posts.map((p) =>
          p.id === postId
            ? {
                ...p,
                isLiked: post.isLiked,
                likesCount: post.likesCount,
              }
            : p
        ),
      }));
    }
  },

  toggleBookmark: async (postId) => {
    const post = get().posts.find((p) => p.id === postId);
    if (!post) return;

    set((state) => ({
      posts: state.posts.map((p) =>
        p.id === postId ? { ...p, isBookmarked: !p.isBookmarked } : p
      ),
    }));

    try {
      const method = post.isBookmarked ? 'DELETE' : 'POST';
      await fetch(`${API_URL}/api/posts/${postId}/bookmark`, {
        method,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });
    } catch (error) {
      set((state) => ({
        posts: state.posts.map((p) =>
          p.id === postId ? { ...p, isBookmarked: post.isBookmarked } : p
        ),
      }));
    }
  },

  toggleRepost: async (postId) => {
    const post = get().posts.find((p) => p.id === postId);
    if (!post) return;

    set((state) => ({
      posts: state.posts.map((p) =>
        p.id === postId
          ? {
              ...p,
              isReposted: !p.isReposted,
              repostsCount: p.isReposted ? p.repostsCount - 1 : p.repostsCount + 1,
            }
          : p
      ),
    }));

    try {
      const method = post.isReposted ? 'DELETE' : 'POST';
      await fetch(`${API_URL}/api/posts/${postId}/repost`, {
        method,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });
    } catch (error) {
      set((state) => ({
        posts: state.posts.map((p) =>
          p.id === postId
            ? {
                ...p,
                isReposted: post.isReposted,
                repostsCount: post.repostsCount,
              }
            : p
        ),
      }));
    }
  },

  refreshFeed: async () => {
    set({ posts: [], cursor: null, hasMore: true });
    await get().fetchPosts();
  },
}));
