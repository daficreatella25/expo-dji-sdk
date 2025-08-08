
export type SDKInitializationResult = {
  success: boolean;
  message: string;
  isRegistered: boolean;
  sdkVersion: string;
};

export type DroneConnectionPayload = {
  connected: boolean;
  productId?: number;
};

export type DroneConnectionStatus = {
  connected: boolean;
  sdkRegistered: boolean;
  productConnected: boolean;
  productType: string;
};

export type DroneHealthInfo = {
  componentIndex: number;
  componentType: string;
  currentWarningLevel: string;
  warningMessages: string[];
};

export type DroneInfo = {
  productId?: number;
  productCategory?: string;
  sdkVersion: string;
  isRegistered: boolean;
  healthInfo?: DroneHealthInfo[];
};

export type DroneInfoUpdatePayload = {
  type: 'basicInfo' | 'healthInfo' | 'error';
  data?: DroneInfo;
  error?: string;
};

export type SDKTestResult = {
  success: boolean;
  message: string;
  sdkVersion?: string;
};

export type VirtualStickState = {
  isVirtualStickEnabled: boolean;
  currentFlightControlAuthorityOwner: string;
  isVirtualStickAdvancedModeEnabled: boolean;
};

export type VirtualStickStateChangePayload = {
  type: 'stateUpdate' | 'authorityChange';
  state?: VirtualStickState;
  reason?: string;
};

export type DetailedDroneInfo = {
  productType: string;
  firmwareVersion: string;
  serialNumber: string;
  productId: number;
  sdkVersion: string;
  isRegistered: boolean;
  isConnected: boolean;
};

export type ExpoDjiSdkViewProps = {
  name: string;
  url?: string;
  onLoad?: (event: { nativeEvent: { url: string } }) => void;
};

export type CameraStreamInfo = {
  width: number;
  height: number;
  frameRate: number;
};

export type CameraStreamStatus = {
  isAvailable: boolean;
  isEnabled: boolean;
  error?: string;
  streamInfo?: CameraStreamInfo;
};

export type CameraIndex = {
  value: number;
  name: string;
};

export type AvailableCameraUpdate = {
  availableCameras: CameraIndex[];
};

// Virtual Stick Control Types
export type VirtualStickCommand = {
  leftX: number;    // Yaw control (-1.0 to 1.0)
  leftY: number;    // Vertical control (-1.0 to 1.0)
  rightX: number;   // Roll control (-1.0 to 1.0)
  rightY: number;   // Pitch control (-1.0 to 1.0)
};

export type VirtualStickControlMode = {
  rollPitchMode: 'VELOCITY' | 'ANGLE';
  yawMode: 'ANGLE' | 'ANGULAR_VELOCITY';
  verticalMode: 'VELOCITY' | 'POSITION';
  coordinateSystem: 'GROUND' | 'BODY';
};

// Flight Status Types
export type FlightStatus = {
  isConnected: boolean;
  areMotorsOn: boolean;
  isFlying: boolean;
  flightMode: string;
};

export type ReadinessCheck = {
  ready: boolean;
  reason: string;
};

// Takeoff and Landing Types
export type TakeoffResult = {
  success: boolean;
  message?: string;
  error?: string;
};

export type LandingResult = {
  success: boolean;
  message?: string;
  error?: string;
};

// Calibration Types
export type CompassCalibrationStatus = {
  status: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
  description: string;
};

// Altitude Types
export type AltitudeInfo = {
  altitude: number;
  unit: string;
};

export type ExpoDjiSdkModuleEvents = {
  onSDKRegistrationResult: (params: SDKInitializationResult) => void;
  onDroneConnectionChange: (params: DroneConnectionPayload) => void;
  onDroneInfoUpdate: (params: DroneInfoUpdatePayload) => void;
  onSDKInitProgress: (params: { event: string; progress: number }) => void;
  onDatabaseDownloadProgress: (params: { current: number; total: number; progress: number }) => void;
  onVirtualStickStateChange: (params: VirtualStickStateChangePayload) => void;
  onAvailableCameraUpdated: (params: AvailableCameraUpdate) => void;
  onCameraStreamStatusChange: (params: CameraStreamStatus) => void;
  onTakeoffResult: (params: TakeoffResult) => void;
  onLandingResult: (params: LandingResult) => void;
  onFlightStatusChange: (params: FlightStatus) => void;
};
