# React Native IAP 集成说明

> 本文是项目内 `react-native-iap` 订阅链路的实现笔记，配合 `App.tsx` 与 `src/services/` 阅读。
> 文中产品 ID 均为示例值（`com.example.*`），实际值由 `src/config/env.ts` 的 `APP_BUNDLE_ID` 派生。

本项目使用 React Native IAP 库实现 iOS 应用内购买功能。以下是实现的主要组件和使用说明。

## 安装依赖

```bash
yarn add react-native-iap
cd ios && pod install
```

## 核心组件

### 1. App.tsx

应用根组件，使用 `withIAPContext` 包装器初始化 IAP 服务：

```typescript
import { withIAPContext, setup, initConnection, endConnection } from 'react-native-iap';

// 在根组件 useEffect 中初始化
useEffect(() => {
  // 设置 StoreKit 2 模式
  setup({ storekitMode: 'STOREKIT2_MODE' });

  // 初始化连接
  initConnection();

  return () => {
    // 清理连接
    endConnection();
  };
}, []);

// 导出带 IAP 上下文的应用
export default withIAPContext(App);
```

### 2. SubscriptionService.ts

处理订阅购买、验证和状态管理的服务类：

- 初始化 IAP 连接
- 处理购买更新事件
- 处理购买错误事件
- 验证购买交易
- 管理订阅状态
- 从后台恢复时与 StoreKit 重新对齐状态（`syncSubscriptionWithStoreKit`）

### 3. SubscriptionValidationService.ts

处理订阅验证的服务类：

- 验证 iOS 交易收据
- 解析交易信息

## 使用方法

### 1. 获取可用订阅产品

```typescript
import { getSubscriptions } from 'react-native-iap';

const subscriptions = await getSubscriptions({
  skus: [IOS_SKUS.monthly, IOS_SKUS.yearly],
});
```

### 2. 购买订阅

```typescript
import { SubscriptionService } from './services/SubscriptionService';

const subscriptionService = SubscriptionService.getInstance();
await subscriptionService.purchaseSubscription('monthly');
```

### 3. 恢复订阅

```typescript
const subscriptionService = SubscriptionService.getInstance();
await subscriptionService.restoreSubscriptions();
```

### 4. 检查订阅状态

```typescript
const subscriptionService = SubscriptionService.getInstance();
await subscriptionService.checkSubscriptionStatus();
```

## 注意事项

1. 需要在 App Store Connect 中先创建对应的自动续期订阅产品，产品 ID 与 `SUBSCRIPTION_SKU_PREFIX` 派生规则一致。
2. **收据校验应当放在服务端完成。** 当前实现为客户端直连 `verifyReceipt`，仅用于原型验证；`EXPO_PUBLIC_APP_SHARED_SECRET` 会被打包进客户端，不能当作秘密使用。生产环境建议改用 App Store Server API 或校验 StoreKit 2 的 JWS 交易签名。
3. StoreKit 2 模式需要 iOS 15+。
4. 处理交易时必须确保调用 `finishTransaction` 以完成交易。
5. 订阅状态不能只信任本地缓存，需在启动与回到前台时与 StoreKit 对齐。
