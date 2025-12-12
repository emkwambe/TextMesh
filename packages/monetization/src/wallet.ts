import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  Wallet,
  WalletTransaction,
  Amount,
  Currency,
} from './types';

export class WalletService {
  private redis: Redis;
  private readonly walletPrefix = 'monetization:wallet:';
  private readonly txPrefix = 'monetization:tx:';
  private readonly txListPrefix = 'monetization:tx_list:';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async createWallet(userId: string): Promise<Wallet> {
    const existing = await this.getWallet(userId);
    if (existing) return existing;

    const wallet: Wallet = {
      userId,
      balances: {
        USD: 0,
        EUR: 0,
        GBP: 0,
        credits: 0,
      },
      pendingBalance: 0,
      lifetimeEarnings: 0,
      lifetimeSpent: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.saveWallet(wallet);
    return wallet;
  }

  async getWallet(userId: string): Promise<Wallet | null> {
    const data = await this.redis.get(`${this.walletPrefix}${userId}`);
    if (!data) return null;
    return this.deserializeWallet(data);
  }

  async getOrCreateWallet(userId: string): Promise<Wallet> {
    const wallet = await this.getWallet(userId);
    if (wallet) return wallet;
    return this.createWallet(userId);
  }

  async credit(
    userId: string,
    amount: Amount,
    description: string,
    reference?: string,
    referenceType?: WalletTransaction['referenceType']
  ): Promise<WalletTransaction> {
    const wallet = await this.getOrCreateWallet(userId);

    const tx: WalletTransaction = {
      id: uuidv4(),
      walletId: userId,
      type: 'credit',
      amount,
      description,
      reference,
      referenceType,
      status: 'completed',
      createdAt: new Date(),
      completedAt: new Date(),
    };

    wallet.balances[amount.currency] += amount.value;
    wallet.lifetimeEarnings += amount.value;
    wallet.updatedAt = new Date();

    await Promise.all([
      this.saveWallet(wallet),
      this.saveTransaction(tx),
    ]);

    return tx;
  }

  async debit(
    userId: string,
    amount: Amount,
    description: string,
    reference?: string,
    referenceType?: WalletTransaction['referenceType']
  ): Promise<WalletTransaction> {
    const wallet = await this.getOrCreateWallet(userId);

    if (wallet.balances[amount.currency] < amount.value) {
      throw new Error('Insufficient balance');
    }

    const tx: WalletTransaction = {
      id: uuidv4(),
      walletId: userId,
      type: 'debit',
      amount,
      description,
      reference,
      referenceType,
      status: 'completed',
      createdAt: new Date(),
      completedAt: new Date(),
    };

    wallet.balances[amount.currency] -= amount.value;
    wallet.lifetimeSpent += amount.value;
    wallet.updatedAt = new Date();

    await Promise.all([
      this.saveWallet(wallet),
      this.saveTransaction(tx),
    ]);

    return tx;
  }

  async hold(
    userId: string,
    amount: Amount,
    description: string,
    reference?: string
  ): Promise<WalletTransaction> {
    const wallet = await this.getOrCreateWallet(userId);

    if (wallet.balances[amount.currency] < amount.value) {
      throw new Error('Insufficient balance for hold');
    }

    const tx: WalletTransaction = {
      id: uuidv4(),
      walletId: userId,
      type: 'hold',
      amount,
      description,
      reference,
      status: 'pending',
      createdAt: new Date(),
    };

    wallet.balances[amount.currency] -= amount.value;
    wallet.pendingBalance += amount.value;
    wallet.updatedAt = new Date();

    await Promise.all([
      this.saveWallet(wallet),
      this.saveTransaction(tx),
    ]);

    return tx;
  }

  async releaseHold(
    transactionId: string,
    release: boolean = true
  ): Promise<WalletTransaction> {
    const tx = await this.getTransaction(transactionId);
    if (!tx || tx.type !== 'hold' || tx.status !== 'pending') {
      throw new Error('Invalid hold transaction');
    }

    const wallet = await this.getWallet(tx.walletId);
    if (!wallet) throw new Error('Wallet not found');

    if (release) {
      // Return funds to available balance
      wallet.balances[tx.amount.currency] += tx.amount.value;
      tx.status = 'reversed';
    } else {
      // Complete the hold (funds leave wallet)
      wallet.lifetimeSpent += tx.amount.value;
      tx.status = 'completed';
    }

    wallet.pendingBalance -= tx.amount.value;
    wallet.updatedAt = new Date();
    tx.completedAt = new Date();

    await Promise.all([
      this.saveWallet(wallet),
      this.saveTransaction(tx),
    ]);

    return tx;
  }

  async getBalance(userId: string, currency: Currency = 'credits'): Promise<number> {
    const wallet = await this.getWallet(userId);
    if (!wallet) return 0;
    return wallet.balances[currency];
  }

  async getTransactionHistory(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      type?: WalletTransaction['type'];
      referenceType?: WalletTransaction['referenceType'];
    } = {}
  ): Promise<WalletTransaction[]> {
    const { limit = 50, offset = 0, type, referenceType } = options;

    const txIds = await this.redis.lrange(
      `${this.txListPrefix}${userId}`,
      offset,
      offset + limit - 1
    );

    const transactions: WalletTransaction[] = [];

    for (const txId of txIds) {
      const tx = await this.getTransaction(txId);
      if (tx) {
        if (type && tx.type !== type) continue;
        if (referenceType && tx.referenceType !== referenceType) continue;
        transactions.push(tx);
      }
    }

    return transactions;
  }

  async getEarningsSummary(
    userId: string,
    period: 'day' | 'week' | 'month' = 'month'
  ): Promise<{
    totalEarned: number;
    totalSpent: number;
    byType: Record<string, number>;
  }> {
    const transactions = await this.getTransactionHistory(userId, { limit: 1000 });

    const now = new Date();
    const periodStart = new Date(now);

    if (period === 'day') {
      periodStart.setDate(periodStart.getDate() - 1);
    } else if (period === 'week') {
      periodStart.setDate(periodStart.getDate() - 7);
    } else {
      periodStart.setMonth(periodStart.getMonth() - 1);
    }

    let totalEarned = 0;
    let totalSpent = 0;
    const byType: Record<string, number> = {};

    for (const tx of transactions) {
      if (tx.createdAt < periodStart) continue;

      if (tx.type === 'credit') {
        totalEarned += tx.amount.value;
        const key = tx.referenceType || 'other';
        byType[key] = (byType[key] || 0) + tx.amount.value;
      } else if (tx.type === 'debit') {
        totalSpent += tx.amount.value;
      }
    }

    return { totalEarned, totalSpent, byType };
  }

  async transfer(
    fromUserId: string,
    toUserId: string,
    amount: Amount,
    description: string
  ): Promise<{ debitTx: WalletTransaction; creditTx: WalletTransaction }> {
    // Debit sender
    const debitTx = await this.debit(
      fromUserId,
      amount,
      `Transfer to ${toUserId}: ${description}`
    );

    // Credit receiver
    const creditTx = await this.credit(
      toUserId,
      amount,
      `Transfer from ${fromUserId}: ${description}`
    );

    return { debitTx, creditTx };
  }

  private async saveWallet(wallet: Wallet): Promise<void> {
    await this.redis.set(
      `${this.walletPrefix}${wallet.userId}`,
      JSON.stringify(wallet)
    );
  }

  private async saveTransaction(tx: WalletTransaction): Promise<void> {
    await this.redis.set(`${this.txPrefix}${tx.id}`, JSON.stringify(tx));
    await this.redis.lpush(`${this.txListPrefix}${tx.walletId}`, tx.id);
    // Keep last 1000 transactions
    await this.redis.ltrim(`${this.txListPrefix}${tx.walletId}`, 0, 999);
  }

  private async getTransaction(txId: string): Promise<WalletTransaction | null> {
    const data = await this.redis.get(`${this.txPrefix}${txId}`);
    if (!data) return null;

    const tx = JSON.parse(data);
    tx.createdAt = new Date(tx.createdAt);
    if (tx.completedAt) tx.completedAt = new Date(tx.completedAt);
    return tx;
  }

  private deserializeWallet(data: string): Wallet {
    const wallet = JSON.parse(data);
    wallet.createdAt = new Date(wallet.createdAt);
    wallet.updatedAt = new Date(wallet.updatedAt);
    return wallet;
  }
}
