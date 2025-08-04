import { NativeModule, requireNativeModule } from 'expo';

import { ExpoDjiSdkModuleEvents, SDKInitializationResult, SDKTestResult, DroneConnectionStatus, VirtualStickState, DetailedDroneInfo } from './ExpoDjiSdk.types';

declare class ExpoDjiSdkModule extends NativeModule<ExpoDjiSdkModuleEvents> {
  testSDKClass(): Promise<SDKTestResult>;
  initializeSDK(): Promise<SDKInitializationResult>;
  isDroneConnected(): Promise<DroneConnectionStatus>;
  getDroneInfo(): Promise<boolean>;
  getDetailedDroneInfo(): Promise<DetailedDroneInfo>;
  enableVirtualStick(): Promise<{ success: boolean }>;
  disableVirtualStick(): Promise<{ success: boolean }>;
  getVirtualStickState(): Promise<VirtualStickState>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoDjiSdkModule>('ExpoDjiSdk');
