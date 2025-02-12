import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import { zh } from './zh';
import { en } from './en';

const translations = {
  zh,
  en,
};

export const i18n = new I18n(translations);

// 设置默认语言
i18n.defaultLocale = 'zh';
i18n.locale = Localization.locale.split('-')[0];
i18n.enableFallback = true;

// 扩展 I18n 类型
declare module 'i18n-js' {
  interface I18n {
    locale: string;
    defaultLocale: string;
    enableFallback: boolean;
  }
}

export type Language = 'zh' | 'en'; 