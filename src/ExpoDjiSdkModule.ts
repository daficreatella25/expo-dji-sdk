import { NativeModule, requireNativeModule } from 'expo';

import { ExpoDjiSdkModuleEvents, SDKInitializationResult } from './ExpoDjiSdk.types';

declare class ExpoDjiSdkModule extends NativeModule<ExpoDjiSdkModuleEvents> {
  initializeSDK(appKey: string): Promise<SDKInitializationResult>;
  isDroneConnected(): Promise<boolean>;
  getDroneInfo(): Promise<boolean>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoDjiSdkModule>('ExpoDjiSdk');
