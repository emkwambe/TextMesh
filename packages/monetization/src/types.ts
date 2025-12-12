// Currency and amounts
export type Currency = 'USD' | 'EUR' | 'GBP' | 'credits';

export interface Amount {
  value: number; // In smallest unit (cents, credits)
  currency: Currency;
}

// Wallet system
export interface Wallet {
  userId: string;
  balances: Record<Currency, number>;
  pendingBalance: number; // Awaiting settlement
  lifetimeEarnings: number;
  lifetimeSpent: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  type: 'credit' | 'debit' | 'hold' | 'release';
  amount: Amount;
  description: string;
  reference?: string; // Related entity ID
  referenceType?: 'micropayment' | 'tip' | 'subscription' | 'bounty' | 'withdrawal' | 'deposit';
  status: 'pending' | 'completed' | 'failed' | 'reversed';
  createdAt: Date;
  completedAt?: Date;
}

// Micropayments (read-time based)
export interface MicropaymentConfig {
  enabled: boolean;
  ratePerMinute: Amount; // e.g., 0.1 cents per minute
  minPayout: Amount; // Minimum before payout
  platformFeePercent: number; // Platform cut
  creatorSharePercent: number; // Creator cut
}

export interface ReadSession {
  id: string;
  readerId: string;
  contentId: string;
  authorId: string;
  startTime: Date;
  endTime?: Date;
  totalSeconds: number;
  earnedAmount: Amount;
  settled: boolean;
}

export interface MicropaymentSummary {
  userId: string;
  period: 'daily' | 'weekly' | 'monthly';
  date: string;
  totalReadTime: number; // seconds
  totalEarned: Amount;
  totalPaid: Amount;
  contentBreakdown: Array<{
    contentId: string;
    readTime: number;
    earned: Amount;
  }>;
}

// Tips
export interface TipConfig {
  enabled: boolean;
  presetAmounts: Amount[];
  customAmountEnabled: boolean;
  minAmount: Amount;
  maxAmount: Amount;
  platformFeePercent: number;
}

export interface Tip {
  id: string;
  senderId: string;
  recipientId: string;
  contentId?: string; // Optional - can tip user directly
  amount: Amount;
  message?: string;
  isAnonymous: boolean;
  platformFee: Amount;
  creatorReceived: Amount;
  status: 'pending' | 'completed' | 'refunded';
  createdAt: Date;
}

// Subscriber Circles (paid subscriptions)
export interface SubscriptionTier {
  id: string;
  creatorId: string;
  name: string;
  description: string;
  price: Amount;
  billingPeriod: 'monthly' | 'yearly';
  benefits: string[];
  maxSubscribers?: number; // Optional cap
  isActive: boolean;
  createdAt: Date;
}

export interface Subscription {
  id: string;
  subscriberId: string;
  creatorId: string;
  tierId: string;
  status: 'active' | 'cancelled' | 'expired' | 'paused';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelledAt?: Date;
  platformFeePercent: number;
  createdAt: Date;
}

export interface SubscriptionPayment {
  id: string;
  subscriptionId: string;
  amount: Amount;
  platformFee: Amount;
  creatorReceived: Amount;
  periodStart: Date;
  periodEnd: Date;
  status: 'pending' | 'completed' | 'failed';
  createdAt: Date;
}

// Skill Bounties
export interface Bounty {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  amount: Amount;
  escrowedAmount: Amount;
  category: string;
  skills: string[];
  deadline?: Date;
  maxSubmissions?: number;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled' | 'expired';
  winnerId?: string;
  platformFeePercent: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BountySubmission {
  id: string;
  bountyId: string;
  submitterId: string;
  content: string;
  attachments?: string[];
  status: 'pending' | 'accepted' | 'rejected';
  feedback?: string;
  createdAt: Date;
  reviewedAt?: Date;
}

// Data Dividends
export interface DataDividendConfig {
  enabled: boolean;
  optInRequired: boolean;
  sharePercentage: number; // % of data revenue shared with users
  minPayout: Amount;
  payoutFrequency: 'monthly' | 'quarterly';
}

export interface DataContribution {
  userId: string;
  period: string; // YYYY-MM
  dataPoints: number; // Number of data points contributed
  estimatedValue: Amount;
  status: 'accruing' | 'calculated' | 'paid';
}

// Payout system
export interface PayoutRequest {
  id: string;
  userId: string;
  amount: Amount;
  method: 'bank_transfer' | 'paypal' | 'crypto' | 'credits';
  destination: string; // Account details (encrypted reference)
  status: 'pending' | 'processing' | 'completed' | 'failed';
  fee: Amount;
  netAmount: Amount;
  createdAt: Date;
  processedAt?: Date;
}

// Platform revenue tracking
export interface PlatformRevenue {
  period: string; // YYYY-MM-DD
  micropaymentFees: Amount;
  tipFees: Amount;
  subscriptionFees: Amount;
  bountyFees: Amount;
  totalRevenue: Amount;
}

// Events
export type MonetizationEvent =
  | 'wallet_credited'
  | 'wallet_debited'
  | 'tip_sent'
  | 'tip_received'
  | 'subscription_created'
  | 'subscription_cancelled'
  | 'bounty_created'
  | 'bounty_completed'
  | 'payout_requested'
  | 'payout_completed';
