import { ReactNode } from 'react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left side - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-500 to-secondary-600 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/patterns/mesh.svg')] opacity-10" />
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <Link href="/" className="flex items-center gap-3 mb-12">
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center">
              <span className="text-primary-500 font-bold text-2xl">T</span>
            </div>
            <span className="font-display text-3xl font-bold">TextMesh</span>
          </Link>

          <h1 className="text-5xl font-display font-bold leading-tight mb-6">
            Connect Through<br />Words
          </h1>

          <p className="text-xl text-white/80 max-w-md mb-8">
            A text-first social platform where your ideas matter more than images.
            Join millions sharing thoughts that spark conversations.
          </p>

          <div className="flex gap-8 text-white/60 text-sm">
            <div>
              <div className="text-3xl font-bold text-white">100M+</div>
              <div>Active Users</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">500M+</div>
              <div>Daily Posts</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">190+</div>
              <div>Countries</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - auth form */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 lg:px-16">
        <div className="lg:hidden mb-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-xl">T</span>
            </div>
            <span className="font-display text-2xl font-bold">TextMesh</span>
          </Link>
        </div>

        <div className="max-w-md w-full mx-auto">
          {children}
        </div>

        <div className="mt-8 text-center text-sm text-neutral-500">
          <p>
            By continuing, you agree to our{' '}
            <Link href="/terms" className="link">Terms of Service</Link>
            {' '}and{' '}
            <Link href="/privacy" className="link">Privacy Policy</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
