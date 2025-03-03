# React Native IAP 集成说明

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

// 在根组件useEffect中初始化
useEffect(() => {
  // 设置StoreKit2模式
  setup({ storekitMode: 'STOREKIT2_MODE' });
  
  // 初始化连接
  initConnection();
  
  return () => {
    // 清理连接
    endConnection();
  };
}, []);

// 导出带IAP上下文的应用
export default withIAPContext(App);
```

### 2. SubscriptionService.ts

处理订阅购买、验证和状态管理的服务类：

- 初始化 IAP 连接
- 处理购买更新事件
- 处理购买错误事件
- 验证购买交易
- 管理订阅状态

### 3. SubscriptionValidationService.ts

处理订阅验证的服务类：

- 验证iOS交易收据
- 解析交易信息

## 使用方法

### 1. 获取可用订阅产品

```typescript
import { getSubscriptions } from 'react-native-iap';

const subscriptions = await getSubscriptions({
  skus: ['com.yourapp.monthly', 'com.yourapp.yearly']
});
```

### 2. 购买订阅

```typescript
import SubscriptionService from './services/SubscriptionService';

const subscriptionService = SubscriptionService.getInstance();
await subscriptionService.purchaseSubscription('monthly');
```

### 3. 恢复订阅

```typescript
import SubscriptionService from './services/SubscriptionService';

const subscriptionService = SubscriptionService.getInstance();
await subscriptionService.restoreSubscriptions();
```

### 4. 检查订阅状态

```typescript
import SubscriptionService from './services/SubscriptionService';

const subscriptionService = SubscriptionService.getInstance();
await subscriptionService.checkSubscriptionStatus();
```

## 注意事项

1. 需要在App Store Connect设置好应用内购买项目
2. 订阅验证应当在服务器端完成，以确保安全性
3. StoreKit2 模式需要 iOS 15+ 支持
4. 处理交易时必须确保调用 `finishTransaction` 以完成交易 