import { ValidationResult } from '../types/subscription';
import { ReceiptValidationService } from './ReceiptValidationService';
import { TransactionProcessor } from './TransactionProcessor';
import { SubscriptionStateManager } from './SubscriptionStateManager';
import { logger } from '../utils/logger';

export class SubscriptionValidator {
  constructor(
    private receiptValidator: ReceiptValidationService,
    private transactionProcessor: TransactionProcessor,
    private stateManager: SubscriptionStateManager
  ) {}

  async validateSubscription(receipt: string, environment: 'production' | 'sandbox'): Promise<ValidationResult> {
    try {
      // 1. 验证收据
      const validationResult = await this.receiptValidator.verifyReceipt(receipt, environment);
      
      if (!validationResult.isValid || !validationResult.transaction) {
        return validationResult;
      }

      // 2. 验证交易有效性
      const isValid = this.transactionProcessor.isTransactionValid(validationResult.transaction);
      
      if (!isValid) {
        return {
          isValid: false,
          transaction: validationResult.transaction,
          environment: validationResult.environment,
          error: 'Transaction is no longer valid'
        };
      }

      // 3. 更新订阅状态
      await this.stateManager.updateLastTransaction(validationResult.transaction);
      await this.stateManager.updateSubscriptionStatus({
        isActive: true,
        productId: validationResult.transaction.productId,
        expirationDate: validationResult.transaction.expirationDate,
        isTrialPeriod: validationResult.transaction.isTrialPeriod,
        isInGracePeriod: validationResult.transaction.isInGracePeriod,
        autoRenewStatus: validationResult.transaction.autoRenewStatus,
        lastUpdated: new Date().toISOString()
      });

      return validationResult;
    } catch (error) {
      logger.error('Subscription validation failed:', error);
      return {
        isValid: false,
        transaction: null,
        environment,
        error: error instanceof Error ? error.message : 'Unknown error during validation'
      };
    }
  }

  async validateExistingSubscription(): Promise<boolean> {
    try {
      const lastTransaction = await this.stateManager.getLastTransaction();
      if (!lastTransaction) {
        await this.stateManager.clearSubscriptionState();
        return false;
      }

      const isValid = this.transactionProcessor.isTransactionValid(lastTransaction);
      if (!isValid) {
        await this.stateManager.clearSubscriptionState();
        return false;
      }

      await this.stateManager.updateSubscriptionStatus({
        isActive: true,
        productId: lastTransaction.productId,
        expirationDate: lastTransaction.expirationDate,
        isTrialPeriod: lastTransaction.isTrialPeriod,
        isInGracePeriod: lastTransaction.isInGracePeriod,
        autoRenewStatus: lastTransaction.autoRenewStatus,
        lastUpdated: new Date().toISOString()
      });

      return true;
    } catch (error) {
      logger.error('Error validating existing subscription:', error);
      return false;
    }
  }

  async checkTrialEligibility(): Promise<boolean> {
    try {
      const lastTransaction = await this.stateManager.getLastTransaction();
      return this.transactionProcessor.isTrialEligible(lastTransaction);
    } catch (error) {
      logger.error('Error checking trial eligibility:', error);
      return false;
    }
  }

  getExpirationReason(): Promise<string | null> {
    return this.stateManager.getLastTransaction()
      .then(transaction => {
        if (!transaction) {
          return null;
        }
        return this.transactionProcessor.getExpirationReason(transaction);
      })
      .catch(error => {
        logger.error('Error getting expiration reason:', error);
        return null;
      });
  }
} 