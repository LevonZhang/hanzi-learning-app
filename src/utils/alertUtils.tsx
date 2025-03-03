import React, { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { AlertDialog } from '../components/AlertDialog';

interface AlertOptions {
  cancelable?: boolean;
  onDismiss?: () => void;
}

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

// 用于在组件外使用的全局状态
let globalShowAlert: ((
  title: string,
  message: string,
  buttons?: AlertButton[],
  options?: AlertOptions
) => void) | null = null;

// 注册全局Alert处理函数
export const registerAlertHandler = (
  handler: (
    title: string,
    message: string,
    buttons?: AlertButton[],
    options?: AlertOptions
  ) => void
) => {
  globalShowAlert = handler;
};

// 清除全局Alert处理函数
export const unregisterAlertHandler = () => {
  globalShowAlert = null;
};

// 显示自定义Alert对话框的方法
export const showAlert = (
  title: string,
  message: string,
  buttons: AlertButton[] = [{ text: '确定' }],
  options?: AlertOptions
) => {
  if (globalShowAlert) {
    globalShowAlert(title, message, buttons, options);
  } else {
    // 如果未注册全局处理程序，则回退到原生Alert（用于非组件上下文）
    console.warn('AlertDialog全局处理程序未注册。某些设备上的对话框可能没有放大。');
    
    // 在这里可以添加原生Alert的回退逻辑，或者什么也不做
  }
};

// 创建Alert提供者组件，应在应用程序根部使用
export const AlertProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [alertState, setAlertState] = useState<{
    visible: boolean;
    title: string;
    message: string;
    buttons: AlertButton[];
    options?: AlertOptions;
  }>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  });

  // 注册处理函数
  useEffect(() => {
    registerAlertHandler((title, message, buttons = [{ text: '确定' }], options) => {
      setAlertState({
        visible: true,
        title,
        message,
        buttons,
        options,
      });
    });

    return () => {
      unregisterAlertHandler();
    };
  }, []);

  // 处理关闭对话框
  const handleDismiss = () => {
    setAlertState(prev => ({ ...prev, visible: false }));
    
    if (alertState.options?.onDismiss) {
      alertState.options.onDismiss();
    }
  };

  return (
    <>
      {children}
      <AlertDialog
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        buttons={alertState.buttons}
        onDismiss={handleDismiss}
      />
    </>
  );
};

// 创建与原生Alert.alert API兼容的函数
export const CustomAlert = {
  alert: (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions
  ) => {
    showAlert(title, message || '', buttons, options);
  }
}; 