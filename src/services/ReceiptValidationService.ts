import axios from 'axios';
import { CONSTANTS } from '../constants';
import { ENV } from '../config/env';
import { ValidationResult, SubscriptionTransaction, ReceiptValidationError } from '../types/subscription';
import { logger } from '../utils/logger';

export class ReceiptValidationService {
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000;

  async verifyReceipt(receipt: string, environment: 'production' | 'sandbox'): Promise<ValidationResult> {
    try {
      const verificationUrl = environment === 'production' ? 
        CONSTANTS.PROD_VERIFICATION_URL : 
        CONSTANTS.SANDBOX_VERIFICATION_URL;

      const response = await this.sendVerificationRequest(verificationUrl, receipt);
      return this.parseVerificationResponse(response);
    } catch (error) {
      logger.error('Receipt validation failed:', error);
      throw new ReceiptValidationError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async sendVerificationRequest(url: string, receipt: string): Promise<any> {
    let retryCount = 0;
    
    while (retryCount < this.MAX_RETRIES) {
      try {
        const response = await axios.post(url, {
          'receipt-data': receipt,
          'password': ENV.APP_SHARED_SECRET,
          'exclude-old-transactions': true
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        });
        
        return response.data;
      } catch (error) {
        retryCount++;
        if (retryCount < this.MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
        } else {
          throw error;
        }
      }
    }
  }

  private parseVerificationResponse(response: any): ValidationResult {
    const status = response?.status;
    
    if (status !== 0) {
      return {
        isValid: false,
        transaction: null,
        environment: response?.environment || 'production',
        error: `Invalid receipt status: ${status}`
      };
    }

    const latestReceipt = response?.latest_receipt_info?.[0];
    if (!latestReceipt) {
      return {
        isValid: false,
        transaction: null,
        environment: response?.environment || 'production',
        error: 'No receipt info found'
      };
    }

    const transaction = this.extractTransactionInfo(latestReceipt, response?.environment);
    
    return {
      isValid: true,
      transaction,
      environment: response?.environment || 'production'
    };
  }

  private extractTransactionInfo(receipt: any, environment: string): SubscriptionTransaction {
    return {
      productId: receipt.product_id,
      originalTransactionId: receipt.original_transaction_id,
      transactionId: receipt.transaction_id,
      purchaseDate: new Date(parseInt(receipt.purchase_date_ms)),
      expirationDate: new Date(parseInt(receipt.expires_date_ms)),
      isTrialPeriod: receipt.is_trial_period === 'true',
      isInIntroOfferPeriod: receipt.is_in_intro_offer_period === 'true',
      isInGracePeriod: receipt.is_in_billing_retry_period === 'true',
      gracePeriodExpiresDate: receipt.grace_period_expires_date_ms 
        ? new Date(parseInt(receipt.grace_period_expires_date_ms))
        : undefined,
      autoRenewStatus: receipt.auto_renew_status === '1',
      environment: environment as 'production' | 'sandbox',
      webOrderLineItemId: receipt.web_order_line_item_id,
      expirationIntent: receipt.expiration_intent
    };
  }
} 