import { ENV } from '../config/env';

export const logger = {
  debug: (message: string, ...args: any[]) => {
    if (!ENV.IS_PRODUCTION) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },
  
  info: (message: string, ...args: any[]) => {
    console.log(`[INFO] ${message}`, ...args);
  },
  
  warn: (message: string, ...args: any[]) => {
    console.warn(`[WARN] ${message}`, ...args);
  },
  
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${message}`, error);
    // TODO: 在生产环境可以集成错误追踪服务
  },
  
  subscription: (message: string, data?: any) => {
    logger.info(`[SUBSCRIPTION] ${message}`, data);
    // TODO: 可以添加订阅相关的特殊日志处理
  }
}; 