import { translations } from './translations';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'zh' | 'en' | 'ja';

class I18n {
  private static instance: I18n;
  private currentLanguage: Language = 'en';

  private constructor() {
    this.loadLanguage();
  }

  public static getInstance(): I18n {
    if (!I18n.instance) {
      I18n.instance = new I18n();
    }
    return I18n.instance;
  }

  private async loadLanguage() {
    try {
      const savedLanguage = await AsyncStorage.getItem('language');
      if (savedLanguage && (savedLanguage === 'zh' || savedLanguage === 'en' || savedLanguage === 'ja')) {
        this.currentLanguage = savedLanguage;
      }
    } catch (error) {
      console.error('Error loading language:', error);
    }
  }

  public async setLanguage(language: Language) {
    try {
      await AsyncStorage.setItem('language', language);
      this.currentLanguage = language;
    } catch (error) {
      console.error('Error saving language:', error);
    }
  }

  public getLanguage(): Language {
    return this.currentLanguage;
  }

  public t(key: string, params?: { [key: string]: string | number }): string {
    const translation = translations[this.currentLanguage];
    if (!translation) return key;

    let text = translation[key] || key;
    
    if (params) {
      Object.keys(params).forEach(param => {
        text = text.replace(`{${param}}`, String(params[param]));
      });
    }
    
    return text;
  }
}

export const i18n = I18n.getInstance(); 