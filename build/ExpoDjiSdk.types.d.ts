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
    onLoad?: (event: {
        nativeEvent: {
            url: string;
        };
    }) => void;
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
export type VirtualStickCommand = {
    leftX: number;
    leftY: number;
    rightX: number;
    rightY: number;
};
export type VirtualStickControlMode = {
    rollPitchMode: 'VELOCITY' | 'ANGLE';
    yawMode: 'ANGLE' | 'ANGULAR_VELOCITY';
    verticalMode: 'VELOCITY' | 'POSITION';
    coordinateSystem: 'GROUND' | 'BODY';
};
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
export type AltitudeInfo = {
    altitude: number;
    unit: string;
};
export type GPSLocation = {
    latitude: number;
    longitude: number;
    altitude: number;
    isValid: boolean;
    error?: string;
};
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
export type WaypointMissionUploadProgress = {
    progress: number;
    percentage: number;
    status: string;
};
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
    progress: number;
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
    type: 'missionPrepared' | 'missionStarted' | 'missionProgress' | 'missionCompleted' | 'missionStopped' | 'missionFailed' | 'missionPaused' | 'missionResumed';
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
/**
 * Return to start (ReturnToStartController.kt): fly back to DJI's take-off
 * point at the altitude the return began at, descend slowly to hoverHeight,
 * hover with the remote in control until the pilot confirms the landing spot,
 * then DJI auto-landing.
 */
export type ReturnToStartPhase = 'idle' | 'returning' | 'descending' | 'landing_check' | 'landing' | 'landed' | 'cancelled' | 'failed';
export type ReturnToStartState = {
    phase: ReturnToStartPhase;
    paused: boolean;
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
    home: {
        latitude: number;
        longitude: number;
    } | null;
    error: string | null;
    at: number;
};
export type ExpoDjiSdkModuleEvents = {
    onSDKRegistrationResult: (params: SDKInitializationResult) => void;
    onDroneConnectionChange: (params: DroneConnectionPayload) => void;
    onDroneInfoUpdate: (params: DroneInfoUpdatePayload) => void;
    onSDKInitProgress: (params: {
        event: string;
        progress: number;
    }) => void;
    onDatabaseDownloadProgress: (params: {
        current: number;
        total: number;
        progress: number;
    }) => void;
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
    onPhotoDownloadProgress: (params: {
        sessionId: string;
        fileName: string;
        downloaded: number;
        total: number;
        finished: boolean;
    }) => void;
};
//# sourceMappingURL=ExpoDjiSdk.types.d.ts.map