import React, { Component, ErrorInfo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { logger } from '../utils/logger';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// 用于过滤不显示给用户的错误类型
const shouldHideError = (error: Error | null): boolean => {
  if (!error) return false;
  
  const errorPatterns = [
    'Invalid transaction Id',
    'StoreKit',
    'transaction',
    'Purchase',
    'IAP',
    'subscription',
    'receipt'
  ];
  
  return errorPatterns.some(pattern => 
    error.message.includes(pattern) || 
    (error.stack && error.stack.includes(pattern))
  );
};

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error('组件错误边界捕获到错误:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    });
  }

  render() {
    if (this.state.hasError) {
      // 检查是否应该隐藏此错误
      if (shouldHideError(this.state.error)) {
        logger.debug('隐藏购买相关错误:', this.state.error?.message);
        return this.props.children; // 返回子组件，不显示错误
      }
      
      // 显示通用错误信息，而不是具体错误细节
      return (
        <View style={styles.container}>
          <Text style={styles.title}>出现了一个问题</Text>
          <Text style={styles.message}>应用遇到了意外错误，请尝试重启应用。</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa'
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333'
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666'
  }
});

export default ErrorBoundary; 