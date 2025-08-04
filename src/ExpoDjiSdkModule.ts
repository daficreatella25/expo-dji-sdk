import { NativeModule, requireNativeModule } from 'expo';

import { ExpoDjiSdkModuleEvents, SDKInitializationResult, SDKTestResult, DroneConnectionStatus, VirtualStickState } from './ExpoDjiSdk.types';

declare class ExpoDjiSdkModule extends NativeModule<ExpoDjiSdkModuleEvents> {
  testSDKClass(): Promise<SDKTestResult>;
  initializeSDK(): Promise<SDKInitializationResult>;
  isDroneConnected(): Promise<DroneConnectionStatus>;
  getDroneInfo(): Promise<boolean>;
  enableVirtualStick(): Promise<{ success: boolean }>;
  disableVirtualStick(): Promise<{ success: boolean }>;
  getVirtualStickState(): Promise<VirtualStickState>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoDjiSdkModule>('ExpoDjiSdk');
