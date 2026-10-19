import AsyncStorage from '@react-native-async-storage/async-storage';

export const StorageService = {
  async getItem<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const data = await AsyncStorage.getItem(key);
      if (data === null) return defaultValue;
      return JSON.parse(data) as T;
    } catch {
      return defaultValue;
    }
  },

  async setItem<T>(key: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`Failed to save storage key: ${key}`, e);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.warn(`Failed to remove storage key: ${key}`, e);
    }
  },

  async clear(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch (e) {
      console.warn('Failed to clear storage', e);
    }
  },
};
