
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
/** DJI MSDK v5 CompassCalibrationState. 'NONE' is kept for older builds. */
export type CompassCalibrationState = 'IDLE' | 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';

export type CompassCalibrationStatus = {
  status: CompassCalibrationState;
  description: string;
};

/**
 * Pushed on every change while a calibration is watched. The flight
 * controller keeps its previous SUCCEEDED until a new run starts, so only a
 * SUCCEEDED that follows HORIZONTAL/VERTICAL means this run succeeded.
 */
export type CompassCalibrationEvent = CompassCalibrationStatus & {
  isCalibrating: boolean;
  at: number;
};

/** Current DJI-reported compass state, including whether the flight controller
 * is actively reporting a compass error. */
export type CompassHealth = CompassCalibrationStatus & {
  hasError: boolean;
  isCalibrating: boolean;
};

/**
 * A snapshot taken directly from the DJI flight controller before a mission
 * starts. `ready` only covers checks the SDK can determine reliably; DJI may
 * still block takeoff for airspace, firmware, battery, or other flight-safety
 * reasons when a command is issued.
 */
export type PreflightReport = {
  sdkRegistered: boolean;
  productConnected: boolean;
  flightControllerConnected: boolean;
  motorsOn: boolean;
  isFlying: boolean;
  flightMode: string;
  compassHasError: boolean;
  virtualStickEnabled: boolean;
  virtualStickAuthorityOwner: string;
  ready: boolean;
  blockers: string[];
  warnings: string[];
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
  flyToMode: string;
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
  state?: string;
  sdkRegistered?: boolean;
  productConnected?: boolean;
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
  /** Turn the nose toward the middle of the route (orbits). Default false: heading held, sharper photos. */
  faceCenter?: boolean;
  /** Climb to a leg's altitude before moving sideways when it is above the drone. Default true. */
  climbFirst?: boolean;
  /** After the last waypoint, fly back to the take-off point (return to start). Default false. */
  returnWhenDone?: boolean;
  /** With returnWhenDone: land this many ms after reaching the hover height unless held. 0 = wait for the pilot. */
  autoLandAfterMs?: number;
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

/**
 * importKMLMissionFromContent resolves only when the route executor accepted
 * the start (take-off and flying follow as events). Rejection codes:
 * ROUTE_RUNNING (a route is already running), RETURN_IN_PROGRESS,
 * BAD_ROUTE (a waypoint without altitude, below 5 m, above the drone's height
 * limit, or an unreadable point), NOT_CONNECTED, PARSE_ERROR, IMPORT_ERROR.
 * The message is written for the pilot.
 */
export type KMLMissionImportErrorCode =
  | 'ROUTE_RUNNING'
  | 'RETURN_IN_PROGRESS'
  | 'BAD_ROUTE'
  | 'NOT_CONNECTED'
  | 'PARSE_ERROR'
  | 'IMPORT_ERROR';

export type KMLMissionResult = {
  success: boolean;
  missionType?: 'virtual_stick' | 'native' | 'virtualStick';
  waypoints?: number;
  message?: string;
  error?: string;
};

export type KMLMissionStatus = {
  isRunning: boolean;
  isPaused: boolean;
  /** Index of the waypoint being flown to (= waypoints reached so far). */
  currentWaypoint: number;
  missionType: 'none' | 'native' | 'virtual_stick';
};

/** What the route executor is doing (missionPhase events, on change). */
export type KMLMissionPhase = 'takingOff' | 'climbing' | 'flying' | 'waitingForGps';

/**
 * Why a route paused. Every pause hands the sticks to the remote; only
 * resumeKMLMission takes them again (and refuses while DJI is flying its own
 * return or landing, or the drone is not flying).
 * - app: pauseKMLMission
 * - lostControl: virtual sticks off (or unknown) for more than 2 s, e.g. the remote's pause button
 * - djiMode: DJI started its own return home or landing
 * - disconnect: the drone disconnected
 * - stuck: no 1 m of progress toward the current waypoint for 60 s
 * - gps: no usable GPS for 20 s (it hovers meanwhile)
 */
export type KMLMissionPauseSource = 'app' | 'lostControl' | 'djiMode' | 'disconnect' | 'stuck' | 'gps';

export type KMLMissionEvent = {
  // missionStopped: ended before the last waypoint (pilot or return to start); not a completion.
  // autoReturnFailed: the route finished but returnWhenDone could not start the return (error says why).
  // missionCompleted / missionStopped / missionFailed: exactly one per route, after its sticks were released.
  type:
    | 'missionPrepared'
    | 'missionStarted'
    | 'missionPhase'
    | 'missionProgress'
    | 'missionCompleted'
    | 'missionStopped'
    | 'missionFailed'
    | 'missionPaused'
    | 'missionResumed'
    | 'autoReturnFailed';
  data?: KMLMissionStats | KMLMissionProgress;
  missionType?: string;
  error?: string;
  /** missionCompleted: the drone is about to fly home on its own (returnWhenDone). */
  returning?: boolean;
  /** missionPhase */
  phase?: KMLMissionPhase;
  /** missionPhase 'climbing': the altitude it climbs to (m above take-off). */
  targetAltitude?: number | null;
  /** missionPaused: shown to the pilot. */
  reason?: string | null;
  /** missionPaused */
  source?: KMLMissionPauseSource;
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

/**
 * Return to start (ReturnToStartController.kt): fly back to DJI's take-off
 * point at the altitude the return began at, descend to hoverHeight (quick
 * when high, slow near the end), hover with the remote in control until the
 * pilot confirms the landing spot or the auto-land countdown runs out, then
 * DJI auto-landing. Pause holds the countdown, or stops a landing in progress.
 * 'landed' is reached from any active phase once the drone is on the ground
 * with the motors off. Continue is refused while DJI flies its own return or
 * landing.
 */
export type ReturnToStartPhase =
  | 'idle'
  | 'returning'
  | 'descending'
  | 'landing_check'
  | 'landing'
  | 'landed'
  | 'cancelled'
  | 'failed';

export type ReturnToStartState = {
  phase: ReturnToStartPhase;
  paused: boolean;
  /**
   * Why it is paused or the landing is held, e.g. "Paused from the app",
   * "Moved off the start point" (countdown held more than 3 m off the point),
   * "No GPS position; landing held", "Drone disconnected",
   * "Landing stopped from the remote", or the virtual sticks were switched off.
   */
  pauseReason: string | null;
  /** Metres to the take-off point. */
  distanceToHome: number | null;
  /** Metres above the take-off point (barometric). */
  altitude: number | null;
  /** Metres above the ground from the downward sensor, when it has a reading. */
  groundHeight: number | null;
  /** Altitude held on the way back. */
  cruiseAltitude: number;
  hoverHeight: number;
  waitingForGps: boolean;
  /** DJI landing protection is asking whether it is safe to touch down. */
  landingConfirmationNeeded: boolean;
  /** Epoch ms when the countdown lands the drone; null when no countdown is running. */
  autoLandAt: number | null;
  /** Countdown length; 0 means the pilot has to tap Land. */
  autoLandAfterMs: number;
  /** Started by a finished route (returnWhenDone), not by the pilot. */
  afterRoute: boolean;
  home: { latitude: number; longitude: number } | null;
  error: string | null;
  at: number;
};

/** onPhotoDownloadProgress: at most 4 per second, plus one with finished=true per photo. */
export type PhotoDownloadProgress = {
  sessionId: string;
  fileName: string;
  /** Bytes of this photo so far. */
  downloaded: number;
  total: number;
  finished: boolean;
  /** This photo's number (1-based) among `count` photos of the download ("N of M"). */
  index: number;
  count: number;
};

/**
 * downloadSessionPhotos rejection codes: IN_FLIGHT (DJI only reads the SD card
 * on the ground), NO_SESSION ("No photos from this flight": no manifest, and
 * never a whole-card fallback), DOWNLOAD_BUSY, CANCELLED (cancelPhotoDownload),
 * STORAGE (the phone could not store a photo), DOWNLOAD_FAILED, NOT_CONNECTED.
 */
export type PhotoDownloadErrorCode =
  | 'IN_FLIGHT'
  | 'NO_SESSION'
  | 'DOWNLOAD_BUSY'
  | 'CANCELLED'
  | 'STORAGE'
  | 'DOWNLOAD_FAILED'
  | 'NOT_CONNECTED';

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
  onShootPhotoResult: (params: {
    sessionId: string;
    shotIndex: number;
    success: boolean;
    error: string;
  }) => void;
  onCompassCalibrationState: (params: CompassCalibrationEvent) => void;
  onReturnToStartEvent: (params: ReturnToStartState) => void;
  onPhotoDownloadProgress: (params: PhotoDownloadProgress) => void;
};
