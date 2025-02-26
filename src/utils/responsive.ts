import { Dimensions, Platform, ScaledSize } from 'react-native';

// 设备类型断点
const DEVICE_BREAKPOINTS = {
  PHONE: 414,
  DESKTOP: 1024,
} as const;

// 基础字体大小
const BASE_FONT_SIZES = {
  SMALL: 12,
  MEDIUM: 14,
  LARGE: 16,
  XLARGE: 18,
  XXLARGE: 20,
  TITLE: 24,
} as const;

// 设备类型
export type DeviceType = 'PHONE' | 'TABLET' | 'DESKTOP';

// 获取当前窗口尺寸
export const getWindowDimensions = (): ScaledSize => {
  return Dimensions.get('window');
};

// 判断设备类型
export const getDeviceType = (width: number = getWindowDimensions().width): DeviceType => {
  // 确保在 iPad 上返回 TABLET
  if (Platform.OS === 'ios' && Platform.isPad) {
    return 'TABLET';
  }
  
  // 根据屏幕宽度判断设备类型
  return width >= DEVICE_BREAKPOINTS.DESKTOP ? 'DESKTOP' : 'PHONE';
};

// 判断是否为 iPad
export const isIPad = (): boolean => {
  return Platform.OS === 'ios' && Platform.isPad === true;
};

// 判断是否为 Mac
export const isMac = (): boolean => {
  return Platform.OS === 'macos';
};

// 计算响应式字体大小
export const getFontSize = (baseSize: number, deviceType: DeviceType = getDeviceType()): number => {
  // 为iPad设置特殊的缩放因子
  if (Platform.OS === 'ios' && Platform.isPad) {
    return Math.round(baseSize * 1.05);
  }
  
  const scaleFactor = {
    PHONE: 1,
    TABLET: 1.1,
    DESKTOP: 1.2,
  }[deviceType];

  return Math.round(baseSize * scaleFactor);
};

// 获取基础字体大小
export const getBaseFontSizes = (deviceType: DeviceType = getDeviceType()) => {
  return Object.entries(BASE_FONT_SIZES).reduce(
    (acc, [key, size]) => ({
      ...acc,
      [key]: getFontSize(size, deviceType),
    }),
    {} as typeof BASE_FONT_SIZES
  );
};

// 计算响应式间距
export const getSpacing = (baseSpacing: number, deviceType: DeviceType = getDeviceType()): number => {
  // 为iPad设置特殊的缩放因子
  if (Platform.OS === 'ios' && Platform.isPad) {
    return Math.round(baseSpacing * 1.1);
  }
  
  const scaleFactor = {
    PHONE: 1,
    TABLET: 1.2,
    DESKTOP: 1.5,
  }[deviceType];

  return Math.round(baseSpacing * scaleFactor);
};

// 获取容器最大宽度
export const getContainerMaxWidth = (deviceType: DeviceType = getDeviceType()): number => {
  const maxWidths = {
    PHONE: 450,
    TABLET: 768,
    DESKTOP: 1200,
  };
  return maxWidths[deviceType];
};

// 获取响应式样式
export const getResponsiveStyles = (deviceType: DeviceType = getDeviceType()) => {
  const fontSizes = getBaseFontSizes(deviceType);
  
  return {
    container: {
      flex: 1,
      maxWidth: getContainerMaxWidth(deviceType),
      alignSelf: 'center',
      width: '100%',
      paddingHorizontal: getSpacing(15, deviceType),
    },
    safeArea: {
      flex: 1,
      backgroundColor: '#fff',
    },
    content: {
      flex: 1,
      paddingVertical: getSpacing(15, deviceType),
    },
    text: {
      fontSize: fontSizes.MEDIUM,
      lineHeight: Math.round(fontSizes.MEDIUM * 1.5),
    },
    heading: {
      fontSize: fontSizes.TITLE,
      lineHeight: Math.round(fontSizes.TITLE * 1.3),
      fontWeight: '600',
    },
    // iPad 特定样式
    splitView: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between',
    },
    sidebar: {
      width: 320,
      borderRightWidth: 1,
      borderRightColor: '#e0e0e0',
    },
    mainContent: {
      flex: 1,
      paddingHorizontal: getSpacing(30, deviceType),
    },
    // Mac 特定样式
    window: {
      minWidth: 800,
      minHeight: 600,
    },
    toolbar: {
      height: 38,
      flexDirection: 'row' as const,
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: '#e0e0e0',
    },
  };
};

// 监听屏幕尺寸变化
export const addDimensionsListener = (callback: (dimensions: ScaledSize) => void) => {
  return Dimensions.addEventListener('change', ({ window }) => {
    callback(window);
  });
}; 