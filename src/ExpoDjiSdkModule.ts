import { NativeModule, requireNativeModule } from 'expo';

import { 
  ExpoDjiSdkModuleEvents, 
  SDKInitializationResult, 
  SDKTestResult, 
  DroneConnectionStatus, 
  VirtualStickState, 
  DetailedDroneInfo, 
  CameraStreamStatus, 
  CameraStreamInfo, 
  CameraIndex,
  FlightStatus,
  ReadinessCheck,
  CompassCalibrationStatus,
  AltitudeInfo
} from './ExpoDjiSdk.types';

declare class ExpoDjiSdkModule extends NativeModule<ExpoDjiSdkModuleEvents> {
  testSDKClass(): Promise<SDKTestResult>;
  initializeSDK(): Promise<SDKInitializationResult>;
  isDroneConnected(): Promise<DroneConnectionStatus>;
  getDroneInfo(): Promise<boolean>;
  getDetailedDroneInfo(): Promise<DetailedDroneInfo>;
  
  // Virtual Stick Control
  enableVirtualStick(): Promise<{ success: boolean }>;
  disableVirtualStick(): Promise<{ success: boolean }>;
  getVirtualStickState(): Promise<VirtualStickState>;
  getVirtualStickStatus(): Promise<{ speedLevel: number; note: string; suggestion: string }>;
  sendVirtualStickCommand(leftX: number, leftY: number, rightX: number, rightY: number): Promise<{ success: boolean }>;
  setVirtualStickModeEnabled(enabled: boolean): Promise<{ success: boolean; enabled: boolean }>;
  setVirtualStickControlMode(
    rollPitchMode: string,
    yawMode: string,
    verticalMode: string,
    coordinateSystem: string
  ): Promise<{ success: boolean; mode?: string }>;
  
  // Takeoff and Landing
  startTakeoff(): Promise<{ success: boolean; message: string }>;
  startLanding(): Promise<{ success: boolean; message: string }>;
  cancelLanding(): Promise<{ success: boolean; message: string }>;
  
  // Flight Status and Readiness
  getFlightStatus(): Promise<FlightStatus>;
  isReadyForTakeoff(): Promise<ReadinessCheck>;
  
  // Calibration
  startCompassCalibration(): Promise<{ success: boolean; message: string }>;
  getCompassCalibrationStatus(): Promise<CompassCalibrationStatus>;
  
  // Altitude
  getAltitude(): Promise<AltitudeInfo>;
  
  // Camera Stream
  getAvailableCameras(): Promise<CameraIndex[]>;
  enableCameraStream(cameraIndex: number): Promise<{ success: boolean; message?: string }>;
  disableCameraStream(cameraIndex: number): Promise<{ success: boolean; message?: string }>;
  getCameraStreamStatus(cameraIndex: number): Promise<CameraStreamStatus>;
  getCameraStreamInfo(cameraIndex: number): Promise<CameraStreamInfo>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoDjiSdkModule>('ExpoDjiSdk');
