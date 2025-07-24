// Reexport the native module. On web, it will be resolved to ExpoDjiSdkModule.web.ts
// and on native platforms to ExpoDjiSdkModule.ts
export { default } from './ExpoDjiSdkModule';
export * from './ExpoDjiSdk.types';

// Export convenience functions
import ExpoDjiSdkModule from './ExpoDjiSdkModule';

export const testSDKClass = () => ExpoDjiSdkModule.testSDKClass();
export const initializeSDK = () => ExpoDjiSdkModule.initializeSDK();
export const isDroneConnected = () => ExpoDjiSdkModule.isDroneConnected();
export const getDroneInfo = () => ExpoDjiSdkModule.getDroneInfo();
