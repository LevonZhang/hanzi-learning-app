import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';

export class DatabaseManager {
  private db: SQLite.WebSQLDatabase;

  constructor() {
    this.db = SQLite.openDatabase('hanzi.db');
  }

  async initialize() {
    await this.createTables();
    await this.importInitialData();
  }

  private async createTables() {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        // 只保留最基本的表
        tx.executeSql(`
          CREATE TABLE IF NOT EXISTS characters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hanzi TEXT NOT NULL,
            pinyin TEXT NOT NULL,
            meanings_en TEXT NOT NULL,
            meanings_ja TEXT NOT NULL
          );
        `);

        tx.executeSql(`
          CREATE TABLE IF NOT EXISTS user_progress (
            character_id INTEGER PRIMARY KEY,
            learned_date TEXT,
            mastery_level INTEGER DEFAULT 0
          );
        `);
      }, reject, resolve);
    });
  }

  async importInitialData() {
    // 检查是否已导入数据
    const result = await this.checkDataExists();
    if (!result) {
      try {
        // 从资源文件加载汉字数据
        const asset = Asset.fromModule(require('../../assets/hanzi-data.json'));
        await asset.downloadAsync();
        const data = await FileSystem.readAsStringAsync(asset.localUri!);
        const characters = JSON.parse(data);
        
        // 批量插入数据
        await this.batchInsertCharacters(characters);
      } catch (error) {
        console.error('Data import failed:', error);
      }
    }
  }

  // 获取每日学习内容
  async getDailyLearningList(count: number) {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(`
          SELECT c.* FROM characters c
          LEFT JOIN user_progress up ON c.id = up.character_id
          WHERE up.id IS NULL
          ORDER BY c.difficulty, c.hsk_level
          LIMIT ?
        `, [count], (_, { rows }) => {
          resolve(rows._array);
        });
      }, reject);
    });
  }

  // 更新学习进度
  async updateProgress(characterId: number, mastery: number) {
    const date = new Date().toISOString();
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(`
          INSERT OR REPLACE INTO user_progress 
          (character_id, learned_date, mastery_level)
          VALUES (?, ?, ?)
        `, [characterId, date, mastery]);
      }, reject, resolve);
    });
  }
} 