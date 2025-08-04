import { NativeModule, requireNativeModule } from 'expo';

import { ExpoDjiSdkModuleEvents, SDKInitializationResult, SDKTestResult, DroneConnectionStatus, VirtualStickState, DetailedDroneInfo, InitializationSettings, VirtualStickControlData } from './ExpoDjiSdk.types';

declare class ExpoDjiSdkModule extends NativeModule<ExpoDjiSdkModuleEvents> {
  testSDKClass(): Promise<SDKTestResult>;
  initializeSDK(): Promise<SDKInitializationResult>;
  isDroneConnected(): Promise<DroneConnectionStatus>;
  getDroneInfo(): Promise<boolean>;
  getDetailedDroneInfo(): Promise<DetailedDroneInfo>;
  enableVirtualStick(): Promise<{ success: boolean }>;
  disableVirtualStick(): Promise<{ success: boolean }>;
  getVirtualStickState(): Promise<VirtualStickState>;
  enableSimulator(latitude: number, longitude: number, satelliteCount: number): Promise<{ success: boolean }>;
  disableSimulator(): Promise<{ success: boolean }>;
  isSimulatorEnabled(): Promise<{ enabled: boolean }>;
  setVirtualStickControlData(leftHorizontal: number, leftVertical: number, rightHorizontal: number, rightVertical: number): Promise<{ success: boolean }>;
  setVirtualStickSpeedLevel(speedLevel: number): Promise<{ success: boolean }>;
  takeoff(): Promise<{ success: boolean }>;
  land(): Promise<{ success: boolean }>;
  cancelLanding(): Promise<{ success: boolean }>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoDjiSdkModule>('ExpoDjiSdk');
