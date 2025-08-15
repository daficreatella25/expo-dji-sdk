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
  AltitudeInfo,
  GPSLocation,
  FlyToMissionInfo,
  FlyToResult,
  WaypointMissionSupport,
  WaypointMissionState,
  WaypointMissionLoadResult,
  WaypointMissionResult,
  KMLMissionConfig,
  KMLMissionPreview,
  KMLMissionResult,
  KMLMissionStatus
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
  confirmLanding(): Promise<{ success: boolean; message: string }>;
  isLandingConfirmationNeeded(): Promise<{ isNeeded: boolean; success: boolean; error?: string }>;
  
  // Flight Status and Readiness
  getFlightStatus(): Promise<FlightStatus>;
  isReadyForTakeoff(): Promise<ReadinessCheck>;
  
  // Calibration
  startCompassCalibration(): Promise<{ success: boolean; message: string }>;
  getCompassCalibrationStatus(): Promise<CompassCalibrationStatus>;
  
  // Altitude and GPS
  getAltitude(): Promise<AltitudeInfo>;
  getGPSLocation(): Promise<GPSLocation>;
  
  // Intelligent Flight - FlyTo Mission
  startFlyToMission(latitude: number, longitude: number, altitude: number, maxSpeed: number): Promise<FlyToResult>;
  stopFlyToMission(): Promise<FlyToResult>;
  getFlyToMissionInfo(): Promise<FlyToMissionInfo>;
  
  // Waypoint Mission
  isWaypointMissionSupported(): Promise<WaypointMissionSupport>;
  getWaypointMissionState(): Promise<WaypointMissionState>;
  loadWaypointMissionFromKML(filePath: string): Promise<WaypointMissionLoadResult>;
  generateTestWaypointMission(latitude?: number, longitude?: number): Promise<WaypointMissionLoadResult>;
  getControllerInfo(): Promise<any>;
  convertKMLToKMZ(kmlPath: string, heightMode: string): Promise<any>;
  validateKMZFile(kmzPath: string): Promise<any>;
  uploadKMZToAircraft(kmzPath: string): Promise<any>;
  getAvailableWaylines(kmzPath: string): Promise<any>;
  startWaypointMission(missionFileName?: string): Promise<WaypointMissionResult>;
  stopWaypointMission(missionFileName?: string): Promise<WaypointMissionResult>;
  pauseWaypointMission(): Promise<WaypointMissionResult>;
  resumeWaypointMission(): Promise<WaypointMissionResult>;
  
  // Camera Stream
  getAvailableCameras(): Promise<CameraIndex[]>;
  enableCameraStream(cameraIndex: number): Promise<{ success: boolean; message?: string }>;
  disableCameraStream(cameraIndex: number): Promise<{ success: boolean; message?: string }>;
  getCameraStreamStatus(cameraIndex: number): Promise<CameraStreamStatus>;
  getCameraStreamInfo(cameraIndex: number): Promise<CameraStreamInfo>;
  
  // KML Mission
  importKMLMission(kmlFilePath: string, options?: KMLMissionConfig): Promise<KMLMissionResult>;
  previewKMLMission(kmlFilePath: string): Promise<KMLMissionPreview>;
  importKMLMissionFromContent(kmlContent: string, options?: KMLMissionConfig): Promise<KMLMissionResult>;
  previewKMLMissionFromContent(kmlContent: string): Promise<KMLMissionPreview>;
  pauseKMLMission(): Promise<{ success: boolean; message: string }>;
  resumeKMLMission(): Promise<{ success: boolean; message: string }>;
  stopKMLMission(): Promise<{ success: boolean; message: string }>;
  getKMLMissionStatus(): Promise<KMLMissionStatus>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoDjiSdkModule>('ExpoDjiSdk');
