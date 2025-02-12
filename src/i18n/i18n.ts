import { initReactI18next } from 'react-i18next';
import i18n from 'i18next';
import { zh } from './zh';
import { en } from './en';
import { ja } from './ja';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 支持的语言列表
export const supportedLanguages = ['zh', 'en', 'ja'] as const;

// 初始化i18n配置
const initializeI18n = async () => {
  try {
    // 尝试从存储中获取保存的语言设置
    const savedLanguage = await AsyncStorage.getItem('language');
    
    // 如果有保存的语言设置且在支持的语言列表中，使用保存的语言
    // 否则获取设备语言代码的前两个字符（例如 'zh-CN' -> 'zh'）
    const deviceLanguage = Localization.locale.split('-')[0];
    
    // 确定使用的语言：优先使用保存的语言，其次是设备语言，最后默认使用英语
    const defaultLanguage = savedLanguage && supportedLanguages.includes(savedLanguage as typeof supportedLanguages[number])
      ? savedLanguage
      : supportedLanguages.includes(deviceLanguage as typeof supportedLanguages[number])
        ? deviceLanguage
        : 'en';

    i18n
      .use(initReactI18next)
      .init({
        resources: {
          zh: { translation: zh },
          en: { translation: en },
          ja: { translation: ja }
        },
        lng: defaultLanguage,
        fallbackLng: 'en',
        interpolation: {
          escapeValue: false
        }
      });

    return defaultLanguage;
  } catch (error) {
    console.error('初始化语言设置失败:', error);
    return 'en';
  }
};

export { i18n, initializeI18n };
export type Language = typeof supportedLanguages[number]; 