// Reexport the native module. On web, it will be resolved to ExpoDjiSdkModule.web.ts
// and on native platforms to ExpoDjiSdkModule.ts
export { default } from './ExpoDjiSdkModule';
export { default as CameraStreamView } from './CameraStreamView';
export * from './ExpoDjiSdk.types';

// Export convenience functions
import ExpoDjiSdkModule from './ExpoDjiSdkModule';
import type { KMLMissionConfig } from './ExpoDjiSdk.types';

// SDK Management
export const testSDKClass = () => ExpoDjiSdkModule.testSDKClass();
export const initializeSDK = () => ExpoDjiSdkModule.initializeSDK();
export const isDroneConnected = () => ExpoDjiSdkModule.isDroneConnected();
export const getDroneInfo = () => ExpoDjiSdkModule.getDroneInfo();
export const getDetailedDroneInfo = () => ExpoDjiSdkModule.getDetailedDroneInfo();

// Virtual Stick Control
export const enableVirtualStick = () => ExpoDjiSdkModule.enableVirtualStick();
export const disableVirtualStick = () => ExpoDjiSdkModule.disableVirtualStick();
export const getVirtualStickState = () => ExpoDjiSdkModule.getVirtualStickState();
export const getVirtualStickStatus = () => ExpoDjiSdkModule.getVirtualStickStatus();
export const sendVirtualStickCommand = (leftX: number, leftY: number, rightX: number, rightY: number) => 
  ExpoDjiSdkModule.sendVirtualStickCommand(leftX, leftY, rightX, rightY);
export const setVirtualStickModeEnabled = (enabled: boolean) => ExpoDjiSdkModule.setVirtualStickModeEnabled(enabled);
export const setVirtualStickControlMode = (rollPitchMode: string, yawMode: string, verticalMode: string, coordinateSystem: string) => 
  ExpoDjiSdkModule.setVirtualStickControlMode(rollPitchMode, yawMode, verticalMode, coordinateSystem);

// Takeoff and Landing
export const startTakeoff = () => ExpoDjiSdkModule.startTakeoff();
export const startLanding = () => ExpoDjiSdkModule.startLanding();
export const cancelLanding = () => ExpoDjiSdkModule.cancelLanding();
export const confirmLanding = () => ExpoDjiSdkModule.confirmLanding();
export const isLandingConfirmationNeeded = () => ExpoDjiSdkModule.isLandingConfirmationNeeded();

// Flight Status and Readiness
/** Latest 1 Hz telemetry snapshot; null before the first connection. */
export const getTelemetry = () => ExpoDjiSdkModule.getTelemetry();
/** Battery, GPS, flight mode, position, home and speed once a second while a drone is connected. */
export const addTelemetryListener = (listener: (telemetry: import('./ExpoDjiSdk.types').DroneTelemetry) => void) =>
  ExpoDjiSdkModule.addListener('onTelemetry', listener);
export const getFlightStatus = () => ExpoDjiSdkModule.getFlightStatus();
export const isReadyForTakeoff = () => ExpoDjiSdkModule.isReadyForTakeoff();
export const getPreflightReport = () => ExpoDjiSdkModule.getPreflightReport();

// Calibration
export const startCompassCalibration = () => ExpoDjiSdkModule.startCompassCalibration();
export const stopCompassCalibration = () => ExpoDjiSdkModule.stopCompassCalibration();
export const stopWatchingCompassCalibration = () => ExpoDjiSdkModule.stopWatchingCompassCalibration();
/** Live compass calibration status (after startCompassCalibration). */
// Return to start (see ReturnToStartState)
export const startReturnToStart = (options?: { autoLandAfterMs?: number }) => ExpoDjiSdkModule.startReturnToStart(options ?? {});
export const pauseReturnToStart = () => ExpoDjiSdkModule.pauseReturnToStart();
export const resumeReturnToStart = () => ExpoDjiSdkModule.resumeReturnToStart();
export const landReturnToStart = () => ExpoDjiSdkModule.landReturnToStart();
export const confirmReturnLanding = () => ExpoDjiSdkModule.confirmReturnLanding();
export const cancelReturnToStart = () => ExpoDjiSdkModule.cancelReturnToStart();
export const getReturnToStartState = () => ExpoDjiSdkModule.getReturnToStartState();
export const addReturnToStartListener = (listener: (state: import('./ExpoDjiSdk.types').ReturnToStartState) => void) =>
  ExpoDjiSdkModule.addListener('onReturnToStartEvent', listener);

export const addCompassCalibrationListener = (listener: (event: import('./ExpoDjiSdk.types').CompassCalibrationEvent) => void) =>
  ExpoDjiSdkModule.addListener('onCompassCalibrationState', listener);
export const getCompassCalibrationStatus = () => ExpoDjiSdkModule.getCompassCalibrationStatus();
export const getCompassHealth = () => ExpoDjiSdkModule.getCompassHealth();

// Altitude and GPS
export const getAltitude = () => ExpoDjiSdkModule.getAltitude();
export const getGPSLocation = () => ExpoDjiSdkModule.getGPSLocation();

// Intelligent Flight - FlyTo Mission
export const startFlyToMission = (latitude: number, longitude: number, altitude: number, maxSpeed: number) => 
  ExpoDjiSdkModule.startFlyToMission(latitude, longitude, altitude, maxSpeed);
export const stopFlyToMission = () => ExpoDjiSdkModule.stopFlyToMission();
export const getFlyToMissionInfo = () => ExpoDjiSdkModule.getFlyToMissionInfo();

// Waypoint Mission
export const isWaypointMissionSupported = () => ExpoDjiSdkModule.isWaypointMissionSupported();
export const getWaypointMissionState = () => ExpoDjiSdkModule.getWaypointMissionState();
export const loadWaypointMissionFromKML = (filePath: string) => ExpoDjiSdkModule.loadWaypointMissionFromKML(filePath);
export const generateTestWaypointMission = (latitude?: number, longitude?: number) => ExpoDjiSdkModule.generateTestWaypointMission(latitude, longitude);
export const getControllerInfo = () => ExpoDjiSdkModule.getControllerInfo();
export const convertKMLToKMZ = (kmlPath: string, heightMode: string) => ExpoDjiSdkModule.convertKMLToKMZ(kmlPath, heightMode);
export const validateKMZFile = (kmzPath: string) => ExpoDjiSdkModule.validateKMZFile(kmzPath);
export const uploadKMZToAircraft = (kmzPath: string) => ExpoDjiSdkModule.uploadKMZToAircraft(kmzPath);
export const getAvailableWaylines = (kmzPath: string) => ExpoDjiSdkModule.getAvailableWaylines(kmzPath);
export const startWaypointMission = (missionFileName?: string) => ExpoDjiSdkModule.startWaypointMission(missionFileName);
export const stopWaypointMission = (missionFileName?: string) => ExpoDjiSdkModule.stopWaypointMission(missionFileName);
export const pauseWaypointMission = () => ExpoDjiSdkModule.pauseWaypointMission();
export const resumeWaypointMission = () => ExpoDjiSdkModule.resumeWaypointMission();

// Camera Stream
export const getAvailableCameras = () => ExpoDjiSdkModule.getAvailableCameras();
export const enableCameraStream = (cameraIndex: number) => ExpoDjiSdkModule.enableCameraStream(cameraIndex);
export const disableCameraStream = (cameraIndex: number) => ExpoDjiSdkModule.disableCameraStream(cameraIndex);
export const getCameraStreamStatus = (cameraIndex: number) => ExpoDjiSdkModule.getCameraStreamStatus(cameraIndex);
export const getCameraStreamInfo = (cameraIndex: number) => ExpoDjiSdkModule.getCameraStreamInfo(cameraIndex);

// KML Mission Management
export const previewKMLMissionFromContent = (kmlContent: string) => ExpoDjiSdkModule.previewKMLMissionFromContent(kmlContent);
export const convertKMLContentToKMZ = (kmlContent: string) => ExpoDjiSdkModule.convertKMLContentToKMZ(kmlContent);
export const importAndExecuteKMLFromContent = (kmlContent: string, options?: KMLMissionConfig) => ExpoDjiSdkModule.importKMLMissionFromContent(kmlContent, options);
export const importKMLMissionFromContent = (kmlContent: string, options?: KMLMissionConfig) => ExpoDjiSdkModule.importKMLMissionFromContent(kmlContent, options);
export const pauseKMLMission = () => ExpoDjiSdkModule.pauseKMLMission();
export const resumeKMLMission = () => ExpoDjiSdkModule.resumeKMLMission();
export const stopKMLMission = () => ExpoDjiSdkModule.stopKMLMission();
export const getKMLMissionStatus = () => ExpoDjiSdkModule.getKMLMissionStatus();

// Debug Logging
export const enableDebugLogging = (enabled: boolean) => ExpoDjiSdkModule.enableDebugLogging(enabled);
export const getDebugLogs = () => ExpoDjiSdkModule.getDebugLogs();
export const clearDebugLogs = () => ExpoDjiSdkModule.clearDebugLogs();

// Photo Capture Sessions
export type CameraMode = 'PHOTO' | 'VIDEO';

export interface CaptureSession {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  intervalMs: number;
  shotCount: number;
  downloadedCount: number;
  totalBytes: number;
}

export interface CapturedPhoto {
  path: string;
  uri: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: number;
}

export interface ActiveSession {
  sessionId: string;
  shotCount: number;
  startedAt: number;
  intervalMs: number;
  /** Timer held (route paused, drone disconnected, or pausePhotoSession). */
  paused: boolean;
}

export const setCameraMode = (mode: CameraMode) => ExpoDjiSdkModule.setCameraMode(mode);
export const shootPhoto = () => ExpoDjiSdkModule.shootPhoto();
/**
 * Starts the interval shutter. With `resume: true` and an earlier manifest for
 * this sessionId (same flight, e.g. continue from waypoint N), keeps its
 * startedAt and adds a window instead of starting over. Calling it for the
 * session that is already active just carries on.
 */
export const startPhotoSession = (sessionId: string, intervalMs: number, options?: { resume?: boolean }) =>
  ExpoDjiSdkModule.startPhotoSession(sessionId, intervalMs, options ?? {});
/** Holds the shutter and closes the current window; the session stays. The route does this itself when it pauses. */
export const pausePhotoSession = () => ExpoDjiSdkModule.pausePhotoSession();
/** Opens a new window and restarts the shutter. The route does this itself when it continues. */
export const resumePhotoSession = () => ExpoDjiSdkModule.resumePhotoSession();
export const stopPhotoSession = () => ExpoDjiSdkModule.stopPhotoSession();
export const getActivePhotoSession = (): Promise<ActiveSession | null> =>
  ExpoDjiSdkModule.getActivePhotoSession();
/**
 * Copies this session's photos (taken inside its windows) to the phone.
 * Rejects with a PhotoDownloadErrorCode; progress on onPhotoDownloadProgress.
 */
export const downloadSessionPhotos = (
  sessionId: string
): Promise<{ downloaded: number; skipped: number; failed: number }> =>
  ExpoDjiSdkModule.downloadSessionPhotos(sessionId);
/** Stops a running download (it rejects with CANCELLED). success: false when none was running. */
export const cancelPhotoDownload = (): Promise<{ success: boolean }> => ExpoDjiSdkModule.cancelPhotoDownload();
export const listCaptureSessions = (): Promise<CaptureSession[]> =>
  ExpoDjiSdkModule.listCaptureSessions();
export const listCapturesInSession = (sessionId: string): Promise<CapturedPhoto[]> =>
  ExpoDjiSdkModule.listCapturesInSession(sessionId);
export const deleteCapture = (path: string): Promise<{ success: boolean }> =>
  ExpoDjiSdkModule.deleteCapture(path);

// Gimbal — absolute pitch in degrees. Down is negative: setGimbalPitch(-60)
// points the camera 60° toward the ground for inspection.
export const setGimbalPitch = (degrees: number): Promise<{ success: boolean; pitch: number }> =>
  ExpoDjiSdkModule.setGimbalPitch(degrees);
