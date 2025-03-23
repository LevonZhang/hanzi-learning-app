import { SubscriptionTransaction } from '../types/subscription';
import { logger } from '../utils/logger';

export class TransactionProcessor {
  isTransactionValid(transaction: SubscriptionTransaction): boolean {
    try {
      if (!transaction) {
        return false;
      }

      const now = new Date();

      // 检查是否是终身会员
      if (transaction.productId?.includes('lifetime')) {
        return true;
      }

      // 检查宽限期
      if (transaction.isInGracePeriod && transaction.gracePeriodExpiresDate) {
        return now < transaction.gracePeriodExpiresDate;
      }

      // 检查普通订阅
      return now < transaction.expirationDate;
    } catch (error) {
      logger.error('Error validating transaction:', error);
      return false;
    }
  }

  getSubscriptionDuration(transaction: SubscriptionTransaction): number {
    if (!transaction) {
      return 0;
    }

    return transaction.expirationDate.getTime() - transaction.purchaseDate.getTime();
  }

  isTrialEligible(transaction: SubscriptionTransaction | null): boolean {
    if (!transaction) {
      return true;
    }

    return !transaction.isTrialPeriod && !transaction.isInIntroOfferPeriod;
  }

  isAutoRenewEnabled(transaction: SubscriptionTransaction | null): boolean {
    if (!transaction) {
      return false;
    }

    return transaction.autoRenewStatus === true;
  }

  hasExpired(transaction: SubscriptionTransaction): boolean {
    if (!transaction) {
      return true;
    }

    const now = new Date();
    if (transaction.productId?.includes('lifetime')) {
      return false;
    }

    if (transaction.isInGracePeriod && transaction.gracePeriodExpiresDate) {
      return now >= transaction.gracePeriodExpiresDate;
    }

    return now >= transaction.expirationDate;
  }

  getExpirationReason(transaction: SubscriptionTransaction): string | null {
    if (!transaction.expirationIntent) {
      return null;
    }

    // Apple's expiration intent codes
    switch (transaction.expirationIntent) {
      case '1':
        return 'Customer canceled subscription';
      case '2':
        return 'Billing error';
      case '3':
        return 'Customer did not agree to price increase';
      case '4':
        return 'Product was not available for purchase';
      case '5':
        return 'Unknown error';
      default:
        return null;
    }
  }
} 