'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CheckIcon } from '@/components/icons';
import clsx from 'clsx';

type OnboardingStep = 'welcome' | 'photo' | 'bio' | 'interests' | 'follow' | 'complete';

const INTERESTS = [
  'Technology', 'Science', 'Business', 'Politics', 'Sports',
  'Entertainment', 'Music', 'Art', 'Gaming', 'Travel',
  'Food', 'Health', 'Fashion', 'Photography', 'Books',
  'Movies', 'TV Shows', 'Podcasts', 'News', 'Crypto',
];

const SUGGESTED_USERS = [
  { id: '1', username: 'textmesh', displayName: 'TextMesh', bio: 'Official TextMesh account', isVerified: true },
  { id: '2', username: 'tech_trends', displayName: 'Tech Trends', bio: 'Latest in technology', isVerified: true },
  { id: '3', username: 'daily_thoughts', displayName: 'Daily Thoughts', bio: 'Curated daily inspiration', isVerified: false },
  { id: '4', username: 'startup_world', displayName: 'Startup World', bio: 'Startup news and insights', isVerified: true },
  { id: '5', username: 'creative_minds', displayName: 'Creative Minds', bio: 'Art, design, and creativity', isVerified: false },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, updateUser } = useAuthStore();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [bio, setBio] = useState(user?.bio || '');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [followedUsers, setFollowedUsers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const steps: OnboardingStep[] = ['welcome', 'photo', 'bio', 'interests', 'follow', 'complete'];
  const currentStepIndex = steps.indexOf(step);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const handleNext = async () => {
    if (step === 'bio' && bio) {
      updateUser({ bio });
    }

    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex]);
    }
  };

  const handleSkip = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex]);
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      // Save onboarding data
      toast.success("You're all set! Welcome to TextMesh.");
      router.push('/feed');
    } catch (error) {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  };

  const toggleFollow = (userId: string) => {
    setFollowedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Progress bar */}
      <div className="h-1 bg-neutral-200 dark:bg-neutral-800">
        <div
          className="h-full bg-primary-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-lg mx-auto w-full">
        {/* Welcome */}
        {step === 'welcome' && (
          <div className="text-center animate-fade-in">
            <div className="w-20 h-20 bg-primary-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <span className="text-white font-bold text-4xl">T</span>
            </div>
            <h1 className="text-3xl font-display font-bold mb-4">Welcome to TextMesh!</h1>
            <p className="text-neutral-600 dark:text-neutral-400 mb-8">
              Let&apos;s set up your profile so you can connect with others.
            </p>
            <Button onClick={handleNext} size="lg" fullWidth>
              Get started
            </Button>
          </div>
        )}

        {/* Photo */}
        {step === 'photo' && (
          <div className="text-center animate-fade-in w-full">
            <h1 className="text-2xl font-display font-bold mb-2">Add a profile photo</h1>
            <p className="text-neutral-600 dark:text-neutral-400 mb-8">
              Help people recognize you.
            </p>

            <div className="mb-8">
              <Avatar
                src={user?.avatar}
                alt={user?.displayName || 'User'}
                size="2xl"
                className="mx-auto cursor-pointer hover:opacity-90 transition-opacity"
              />
              <button className="mt-4 text-primary-500 hover:underline">
                Upload photo
              </button>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleSkip} variant="secondary" size="lg" fullWidth>
                Skip for now
              </Button>
              <Button onClick={handleNext} size="lg" fullWidth>
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Bio */}
        {step === 'bio' && (
          <div className="text-center animate-fade-in w-full">
            <h1 className="text-2xl font-display font-bold mb-2">Tell us about yourself</h1>
            <p className="text-neutral-600 dark:text-neutral-400 mb-8">
              Write a short bio to introduce yourself.
            </p>

            <div className="mb-8">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 160))}
                placeholder="A few words about yourself..."
                className="w-full input min-h-[120px] resize-none"
                maxLength={160}
              />
              <p className="text-right text-sm text-neutral-400 mt-1">
                {bio.length}/160
              </p>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleSkip} variant="secondary" size="lg" fullWidth>
                Skip for now
              </Button>
              <Button onClick={handleNext} size="lg" fullWidth>
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Interests */}
        {step === 'interests' && (
          <div className="text-center animate-fade-in w-full">
            <h1 className="text-2xl font-display font-bold mb-2">What interests you?</h1>
            <p className="text-neutral-600 dark:text-neutral-400 mb-8">
              Select at least 3 topics to personalize your feed.
            </p>

            <div className="flex flex-wrap gap-2 justify-center mb-8">
              {INTERESTS.map((interest) => (
                <button
                  key={interest}
                  onClick={() => toggleInterest(interest)}
                  className={clsx(
                    'px-4 py-2 rounded-full text-sm font-medium transition-colors',
                    selectedInterests.includes(interest)
                      ? 'bg-primary-500 text-white'
                      : 'bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                  )}
                >
                  {interest}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <Button onClick={handleSkip} variant="secondary" size="lg" fullWidth>
                Skip for now
              </Button>
              <Button
                onClick={handleNext}
                size="lg"
                fullWidth
                disabled={selectedInterests.length < 3}
              >
                Continue ({selectedInterests.length}/3)
              </Button>
            </div>
          </div>
        )}

        {/* Follow suggestions */}
        {step === 'follow' && (
          <div className="text-center animate-fade-in w-full">
            <h1 className="text-2xl font-display font-bold mb-2">Follow some accounts</h1>
            <p className="text-neutral-600 dark:text-neutral-400 mb-8">
              Get started by following accounts you&apos;re interested in.
            </p>

            <div className="space-y-3 mb-8">
              {SUGGESTED_USERS.map((suggestedUser) => (
                <div
                  key={suggestedUser.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900"
                >
                  <Avatar src={null} alt={suggestedUser.displayName} size="md" />
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-semibold truncate flex items-center gap-1">
                      {suggestedUser.displayName}
                      {suggestedUser.isVerified && (
                        <svg className="w-4 h-4 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </p>
                    <p className="text-sm text-neutral-500 truncate">@{suggestedUser.username}</p>
                  </div>
                  <Button
                    onClick={() => toggleFollow(suggestedUser.id)}
                    variant={followedUsers.includes(suggestedUser.id) ? 'secondary' : 'primary'}
                    size="sm"
                  >
                    {followedUsers.includes(suggestedUser.id) ? (
                      <>
                        <CheckIcon className="w-4 h-4" />
                        Following
                      </>
                    ) : (
                      'Follow'
                    )}
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Button onClick={handleSkip} variant="secondary" size="lg" fullWidth>
                Skip for now
              </Button>
              <Button onClick={handleNext} size="lg" fullWidth>
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Complete */}
        {step === 'complete' && (
          <div className="text-center animate-fade-in">
            <div className="w-20 h-20 bg-success-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckIcon className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-display font-bold mb-4">You&apos;re all set!</h1>
            <p className="text-neutral-600 dark:text-neutral-400 mb-8">
              Your profile is ready. Start exploring and sharing your thoughts!
            </p>
            <Button onClick={handleComplete} size="lg" fullWidth loading={isLoading}>
              Start exploring
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
