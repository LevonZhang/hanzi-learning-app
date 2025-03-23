import { ENV } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private static instance: Logger;
  private isDebugMode: boolean = __DEV__;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setDebugMode(enabled: boolean): void {
    this.isDebugMode = enabled;
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    return `${prefix} ${message}`;
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (!this.isDebugMode && level === 'debug') {
      return;
    }

    const formattedMessage = this.formatMessage(level, message);

    // 检查是否为购买相关错误并隐藏
    if (!__DEV__ && this.shouldHideError(message, ...args)) {
      // 仍记录到日志但不显示给用户
      console.debug(`[HIDDEN_FROM_UI] ${formattedMessage}`, ...args);
      return;
    }

    switch (level) {
      case 'debug':
        console.debug(formattedMessage, ...args);
        break;
      case 'info':
        console.info(formattedMessage, ...args);
        break;
      case 'warn':
        console.warn(formattedMessage, ...args);
        break;
      case 'error':
        console.error(formattedMessage, ...args);
        break;
    }
  }

  debug(message: string, ...args: any[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.log('error', message, ...args);
  }

  subscription(message: string, ...args: any[]): void {
    this.log('info', `[SUBSCRIPTION] ${message}`, ...args);
  }

  // 检查是否应该隐藏特定错误
  private shouldHideError(message: string | any, ...args: any[]): boolean {
    const purchaseErrorPatterns = [
      'Invalid transaction Id',
      '沙盒环境处理购买出错',
      '处理购买时出错',
      '购买请求失败',
      '获取购买记录失败',
      'StoreKit',
      'transaction'
    ];
    
    // 检查主消息
    if (typeof message === 'string') {
      if (purchaseErrorPatterns.some(pattern => message.includes(pattern))) {
        return true;
      }
    }
    
    // 检查参数中是否包含错误信息
    if (args && args.length > 0) {
      for (const arg of args) {
        if (this.objectContainsError(arg, purchaseErrorPatterns)) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  // 递归检查对象中是否包含错误关键字
  private objectContainsError(obj: any, patterns: string[]): boolean {
    if (!obj) return false;
    
    if (typeof obj === 'string') {
      return patterns.some(pattern => obj.includes(pattern));
    }
    
    if (typeof obj === 'object') {
      // 检查对象的每个属性
      for (const key in obj) {
        if (this.objectContainsError(obj[key], patterns)) {
          return true;
        }
      }
    }
    
    return false;
  }
}

export const logger = Logger.getInstance(); 