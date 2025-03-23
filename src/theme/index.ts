import { getDeviceType, DeviceType, getSpacing, getFontSize } from '../utils/responsive';

// 颜色系统
const colors = {
  // 主色调
  primary: '#007AFF',
  primaryDark: '#0056B3',
  primaryLight: '#4D9FFF',
  
  // 辅助色
  secondary: '#5856D6',
  secondaryDark: '#3634A3',
  secondaryLight: '#7E7DFF',
  
  // 背景色
  background: '#FFFFFF',
  surface: '#F8F9FA',
  
  // 文本色
  text: '#333333',
  textSecondary: '#666666',
  
  // 边框色
  border: '#E0E0E0',
  
  // 功能色
  error: '#FF3B30',
  success: '#4CAF50',
  warning: '#FFB300',
  info: '#5B7B9E',
  
  // 特殊用途
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
    spacing: {
      xs: getSpacing(4, deviceType),
      sm: getSpacing(8, deviceType),
      md: getSpacing(16, deviceType),
      lg: getSpacing(24, deviceType),
      xl: getSpacing(32, deviceType),
    },
    typography: {
      h1: {
        fontSize: getFontSize(24, deviceType),
        fontWeight: '600',
      },
      h2: {
        fontSize: getFontSize(20, deviceType),
        fontWeight: '600',
      },
      h3: {
        fontSize: getFontSize(18, deviceType),
        fontWeight: '600',
      },
      body: {
        fontSize: getFontSize(16, deviceType),
        fontWeight: '400',
      },
      caption: {
        fontSize: getFontSize(14, deviceType),
        fontWeight: '400',
      },
    },
    layout: {
      maxWidth: getContainerMaxWidth(deviceType),
      padding: getSpacing(16, deviceType),
      borderRadius: 8,
    },
  };
};

// 获取容器最大宽度
const getContainerMaxWidth = (deviceType: DeviceType): number => {
  const maxWidths = {
    PHONE: 450,
    TABLET: 768,
    DESKTOP: 1200,
  };
  return maxWidths[deviceType];
};

// 导出类型
export type Theme = ReturnType<typeof getTheme>;
export type ColorKeys = keyof typeof colors; 