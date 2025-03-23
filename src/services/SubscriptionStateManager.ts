import AsyncStorage from '@react-native-async-storage/async-storage';
import { SubscriptionStatus, SubscriptionTransaction } from '../types/subscription';
import { logger } from '../utils/logger';
import { CONSTANTS } from '../constants';

export class SubscriptionStateManager {
  private subscriptionListeners: Set<(status: SubscriptionStatus) => void> = new Set();
  private readonly TRANSACTION_STORAGE_KEY = CONSTANTS.STORAGE_KEYS.LAST_TRANSACTION;

  async getSubscriptionStatus(): Promise<SubscriptionStatus | null> {
    try {
      const statusJson = await AsyncStorage.getItem(CONSTANTS.STORAGE_KEYS.SUBSCRIPTION_STATUS);
      if (!statusJson) {
        return null;
      }
      const status = JSON.parse(statusJson);
      return {
        ...status,
        expirationDate: new Date(status.expirationDate)
      };
    } catch (error) {
      logger.error('Error getting subscription status:', error);
      return null;
    }
  }

  async updateSubscriptionStatus(status: SubscriptionStatus): Promise<void> {
    try {
      const statusWithTimestamp = {
        ...status,
        lastUpdated: new Date().toISOString()
      };
      
      await AsyncStorage.setItem(
        CONSTANTS.STORAGE_KEYS.SUBSCRIPTION_STATUS,
        JSON.stringify(statusWithTimestamp)
      );
      
      this.notifyListeners(statusWithTimestamp);
    } catch (error) {
      logger.error('Error updating subscription status:', error);
      throw error;
    }
  }

  addListener(listener: (status: SubscriptionStatus) => void): void {
    this.subscriptionListeners.add(listener);
  }

  removeListener(listener: (status: SubscriptionStatus) => void): void {
    this.subscriptionListeners.delete(listener);
  }

  async clearState(): Promise<void> {
    try {
      await AsyncStorage.removeItem(CONSTANTS.STORAGE_KEYS.SUBSCRIPTION_STATUS);
      
      const emptyStatus: SubscriptionStatus = {
        isActive: false,
        productId: '',
        expirationDate: new Date(0),
        lastUpdated: new Date().toISOString()
      };
      
      this.notifyListeners(emptyStatus);
    } catch (error) {
      logger.error('Error clearing subscription state:', error);
      throw error;
    }
  }

  async getLastTransaction(): Promise<SubscriptionTransaction | null> {
    try {
      const transactionJson = await AsyncStorage.getItem(this.TRANSACTION_STORAGE_KEY);
      if (!transactionJson) {
        return null;
      }
      return JSON.parse(transactionJson);
    } catch (error) {
      logger.error('Error getting last transaction:', error);
      return null;
    }
  }

  async updateLastTransaction(transaction: SubscriptionTransaction): Promise<void> {
    try {
      await AsyncStorage.setItem(
        this.TRANSACTION_STORAGE_KEY,
        JSON.stringify(transaction)
      );
    } catch (error) {
      logger.error('Error updating last transaction:', error);
      throw error;
    }
  }

  async clearSubscriptionState(): Promise<void> {
    try {
      // Clear both the status and transaction
      await this.clearState();
      await AsyncStorage.removeItem(this.TRANSACTION_STORAGE_KEY);
    } catch (error) {
      logger.error('Error clearing subscription state:', error);
      throw error;
    }
  }

  private notifyListeners(status: SubscriptionStatus): void {
    this.subscriptionListeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        logger.error('Error in subscription listener:', error);
      }
    });
  }
} 