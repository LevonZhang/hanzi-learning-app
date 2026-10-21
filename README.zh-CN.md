# 字学堂 HanziLearning

一套用 **Expo + React Native** 实现的跨平台汉字学习应用；对其他开发者更有价值的部分是——它是一个**可直接运行的 React Native StoreKit 2 自动续期订阅范例**，覆盖购买、收据校验、恢复购买与订阅状态同步的完整链路。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Expo SDK](https://img.shields.io/badge/Expo%20SDK-52-000?logo=expo)
![Platforms](https://img.shields.io/badge/platforms-iOS%20%C2%B7%20Android%20%C2%B7%20macOS-blue)

[English](README.md) · **简体中文**

---

## 项目状态

`v1.0.1` 已完成 iOS / Android / macOS 三端构建。应用**目前已不在 App Store 分发**，仓库作为学习功能与订阅实现的参考公开。

关于数据，这里说清楚：**本项目未发布为任何包，没有 npm 分发，因此不存在下载量指标。** 这里提供的是代码，不是采用度。

## 功能

| 功能 | 说明 |
|---|---|
| 汉字学习 | 笔顺动画、书写练习、拼音、中文 / English / 日本語 三语释义 |
| 间隔复习 | 1 / 3 / 7 / 14 / 30 天复习间隔，掌握度 0–5，错题记录 |
| 分级进阶 | 按 HSK 顺序推进，常用字结合词频排序 |
| 搜索 | 任意汉字直接查询，笔顺数据按需获取 |
| 两个小游戏 | 泡泡组词、发音配对 |
| 笔顺卡片 | 将汉字渲染为图片，保存到相册或分享 |
| 三语界面 | 完整 i18n，含字典释义 |
| 响应式布局 | 同一套代码适配手机、平板与 macOS 窗口 |
| 订阅 | 月 / 季 / 年 / 终身四档，基于 StoreKit 2 |

## 订阅层

这是最值得读的部分。在 React Native / Expo 项目里接入 StoreKit 2 自动续期订阅的文档很薄，多数示例代码到"购买成功"就结束了。本项目把链路拆成六个单一职责的服务：

| 文件 | 职责 |
|---|---|
| `src/services/SubscriptionService.ts` | 对外 API 与编排：加载产品、购买、恢复、权益判断 |
| `src/services/TransactionProcessor.ts` | 处理购买更新事件并正确调用 `finishTransaction` |
| `src/services/ReceiptValidationService.ts` | 将收据发往 `verifyReceipt`，含重试与响应映射 |
| `src/services/SubscriptionValidationService.ts` | 对沙箱 / 生产端点校验交易或 JWS |
| `src/services/SubscriptionValidator.ts` | 到期与权益规则，与传输层解耦 |
| `src/services/SubscriptionStateManager.ts` | 订阅状态的持久化与读取 |

两个容易做错、这里已经处理掉的点：

- **状态对齐。** 启动时、以及每次应用回到前台，`syncSubscriptionWithStoreKit()` 会重新向 StoreKit 读取当前权益，而不是信任本地缓存。用户退款、取消、在应用外续订后，界面才不会显示错。
- **错误收敛。** 购买相关错误被拦截并走独立 logger，不会以原始 `console.error` 噪音形式冒出来——StoreKit 在正常流程中确实会抛出无害错误。

入口在 `App.tsx`：`setup({ storekitMode: 'STOREKIT2_MODE' })` → `initConnection()` → `SubscriptionService.initialize()`。

更详细的集成笔记见 [`docs/iap-integration.md`](docs/iap-integration.md)。

## 技术栈

Expo SDK 52 · React Native 0.76.7 · TypeScript · React Navigation 6 · `react-native-iap` 12（StoreKit 2）· `hanzi-writer` · `cnchar`（order / draw / poly / words / voice）· `pinyin-pro` · `i18next` / `react-i18next` · `AsyncStorage` · `expo-speech` / `expo-av` · `react-native-view-shot` / `expo-media-library` / `expo-sharing` · 已启用 New Architecture

## 目录结构

```
App.tsx                  应用入口：i18n 与 IAP 初始化、回前台同步订阅
src/
  components/            HanziWriter、笔顺卡片、游戏组件、响应式容器
  screens/               学习、复习、搜索、游戏、设置
  navigation/            底部 Tab + 游戏 / 设置栈
  services/              学习、字典、存储、统计，以及订阅服务层
  data/                  字典、HSK 顺序、词频数据
  i18n/                  zh / en / ja 语言包
  hooks/ theme/ types/ utils/
```

`ios/` 与 `android/` 未提交，由 `expo prebuild` 生成。

## 快速开始

```bash
npm install
npx expo start          # 按 i / a，或扫码
```

需要原生构建时先生成原生工程：

```bash
npx expo prebuild
npx expo run:ios        # 或：npx expo run:android
```

## 配置

接入你自己的 App Store Connect 应用前：

1. 改**两处** Bundle ID —— `app.json`（`ios.bundleIdentifier`、`android.package`）与 `src/config/env.ts` 的 `APP_BUNDLE_ID`。订阅 SKU 由 `APP_BUNDLE_ID` 派生（`.sub.monthly`、`.sub.quarterly`、`.sub.yearly`、`.sub.lifetime`），需在 App Store Connect 建好对应产品。
2. 复制 `.env.example` 为 `.env`，填入 `EXPO_PUBLIC_APP_SHARED_SECRET` 以启用本地收据校验。
3. 免费额度在 `src/config/env.ts`（`FREE_CHAR_LIMIT`、`FREE_GAME_LEVEL_LIMIT`）。

仓库中的标识符全部为占位值（`com.example.*`），不包含任何真实的团队标识、App Store ID 或凭据。

## 已知限制

- **收据校验在客户端完成。** `EXPO_PUBLIC_*` 会被内联进 bundle，这样分发的共享密钥不是秘密。原型阶段可以接受；生产环境必须放到服务端（更推荐直接校验 StoreKit 2 的 JWS 交易签名）。保留客户端的这条路径，只是为了让链路可读。
- **订阅仅接入 iOS。** 未接 Google Play Billing，Android 构建不带付费墙。
- **没有自动化测试。** 验证靠真机手测。
- **数据文件较大。** `src/data/wordFrequencyData.json` 约 27 MB，首次 clone 较慢。合理做法是移到 Git LFS，或改为首次运行时下载。
- **未分发。** 应用当前不在 App Store，原产品域名也已停用。

## 第三方数据

MIT 许可只覆盖源码。内置的语言数据仍受各自条款约束，再分发前请先确认：

- **CC-CEDICT** —— 字典来源（`scripts/cedict_ts.u8`），CC BY-SA 许可。衍生字典数据可能继承相同方式共享义务。
- **SUBTLEX-CH** —— 中文词频语料（`scripts/SUBTLEX-CH-WF.xlsx`）。学术使用需引用，商用前需确认条款。
- **cnchar**、**hanzi-writer**、**pinyin-pro** —— MIT，以 npm 依赖方式引入。

## 许可证

[MIT](LICENSE) © 2025-2026 Levon Zhang

MIT 许可仅覆盖源码。内置语言数据仍受各自条款约束，见上文「第三方数据」。
