
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

// GPS Location Types (LocationCoordinate3D)
export type GPSLocation = {
  latitude: number;
  longitude: number;
  altitude: number;
  isValid: boolean;
  error?: string;
};

// Intelligent Flight - FlyTo Mission Types
export type FlyToTarget = {
  latitude: number;
  longitude: number;
  altitude: number;
  maxSpeed?: number;
};

export type FlyToMissionInfo = {
  isRunning: boolean;
  currentSpeed: number;
  targetLocation?: {
    latitude: number;
    longitude: number;
    altitude: number;
  };
  distanceToTarget: number;
};

export type FlyToResult = {
  success: boolean;
  message?: string;
  error?: string;
};

// Waypoint Mission Types
export type WaypointMissionSupport = {
  isSupported: boolean;
  success: boolean;
  error?: string;
};

export type WaypointMissionState = {
  state: string;
  success: boolean;
  error?: string;
};

export type WaypointMissionLoadResult = {
  success: boolean;
  message?: string;
  waypointCount?: number;
  filePath?: string;
  error?: string;
};

export type WaypointMissionResult = {
  success: boolean;
  message?: string;
  error?: string;
};

// WPMZ Upload Progress Types
export type WaypointMissionUploadProgress = {
  progress: number;
  percentage: number;
  status: string;
};

// KML Mission Types
export type KMLMissionConfig = {
  speed?: number;
  maxSpeed?: number;
  enableTakePhoto?: boolean;
  enableStartRecording?: boolean;
};

export type KMLMissionStats = {
  totalDistance: number;
  minAltitude: number;
  maxAltitude: number;
  altitudeRange: number;
};

export type KMLMissionProgress = {
  currentWaypoint: number;
  totalWaypoints: number;
  progress: number; // 0.0 to 1.0
  distanceToTarget?: number;
};

export type KMLMissionPreview = {
  name: string;
  originalWaypoints: number;
  optimizedWaypoints: number;
  totalDistance: number;
  minAltitude: number;
  maxAltitude: number;
  altitudeRange: number;
  isValid: boolean;
  issues: string[];
  supportsNativeWaypoints: boolean;
};

export type KMLMissionResult = {
  success: boolean;
  missionType?: 'native' | 'virtualStick';
  waypoints?: number;
  message?: string;
  error?: string;
};

export type KMLMissionStatus = {
  isRunning: boolean;
  isPaused: boolean;
  missionType: 'none' | 'native' | 'virtual_stick';
};

export type KMLMissionEvent = {
  type: 'missionPrepared' | 'missionStarted' | 'missionProgress' | 'missionCompleted' | 'missionFailed' | 'missionPaused' | 'missionResumed';
  data?: KMLMissionStats | KMLMissionProgress;
  missionType?: string;
  error?: string;
};

export type DebugLogEvent = {
  timestamp: number;
  level: string;
  message: string;
  logEntry: string;
};

export type DebugLogsResponse = {
  logs: string[];
  count: number;
  enabled: boolean;
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
  onWaypointMissionUploadProgress: (params: WaypointMissionUploadProgress) => void;
  onKMLMissionEvent: (params: KMLMissionEvent) => void;
  onDebugLog: (params: DebugLogEvent) => void;
};
