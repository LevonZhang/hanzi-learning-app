import { getDeviceType, DeviceType, getSpacing, getFontSize } from '../utils/responsive';

// 颜色系统
export const colors = {
  // 主色调
  primary: '#007AFF',
  primaryDark: '#0056B3',
  primaryLight: '#4D9FFF',
  
  // 辅助色
  secondary: '#5856D6',
  secondaryDark: '#3634A3',
  secondaryLight: '#7E7DFF',
  
  // 功能色
  success: '#4CAF50',
  warning: '#FFB300',
  error: '#FF3B30',
  info: '#5B7B9E',
  
  // 中性色
  background: '#FFFFFF',
  surface: '#F8F9FA',
  border: '#E0E0E0',
  divider: '#EEEEEE',
  
  // 文本色
  textPrimary: '#333333',
  textSecondary: '#666666',
  textTertiary: '#999999',
  textLight: '#FFFFFF',
  
  // 特殊用途
  overlay: 'rgba(0, 0, 0, 0.5)',
  shimmer: 'rgba(255, 255, 255, 0.8)',
  transparent: 'transparent',
} as const;

// 字重
export const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

// 圆角
export const borderRadius = {
  small: 4,
  medium: 8,
  large: 12,
  xlarge: 16,
  round: 999,
} as const;

// 阴影
export const shadows = {
  small: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
} as const;

// 获取响应式主题
export const getTheme = (deviceType: DeviceType = getDeviceType()) => {
  return {
    colors,
    fontWeights,
    borderRadius,
    shadows,
    
    // 响应式间距
    spacing: {
      xs: getSpacing(4, deviceType),
      sm: getSpacing(8, deviceType),
      md: getSpacing(16, deviceType),
      lg: getSpacing(24, deviceType),
      xl: getSpacing(32, deviceType),
      xxl: getSpacing(48, deviceType),
    },
    
    // 响应式字体大小
    typography: {
      caption: {
        fontSize: getFontSize(12, deviceType),
        lineHeight: getFontSize(16, deviceType),
      },
      body: {
        fontSize: getFontSize(14, deviceType),
        lineHeight: getFontSize(20, deviceType),
      },
      subtitle: {
        fontSize: getFontSize(16, deviceType),
        lineHeight: getFontSize(24, deviceType),
      },
      title: {
        fontSize: getFontSize(20, deviceType),
        lineHeight: getFontSize(28, deviceType),
      },
      heading: {
        fontSize: getFontSize(24, deviceType),
        lineHeight: getFontSize(32, deviceType),
      },
    },
    
    // 布局
    layout: {
      maxWidth: {
        PHONE: 450,
        TABLET: 768,
        DESKTOP: 1200,
      }[deviceType],
      containerPadding: getSpacing(16, deviceType),
      navigationHeight: getSpacing(deviceType === 'DESKTOP' ? 64 : 56, deviceType),
    },
  };
};

// 导出类型
export type Theme = ReturnType<typeof getTheme>;
export type ColorKeys = keyof typeof colors; 