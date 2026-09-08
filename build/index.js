// Reexport the native module. On web, it will be resolved to ExpoDjiSdkModule.web.ts
// and on native platforms to ExpoDjiSdkModule.ts
export { default } from './ExpoDjiSdkModule';
export { default as CameraStreamView } from './CameraStreamView';
export * from './ExpoDjiSdk.types';
// Export convenience functions
import ExpoDjiSdkModule from './ExpoDjiSdkModule';
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
export const sendVirtualStickCommand = (leftX, leftY, rightX, rightY) => ExpoDjiSdkModule.sendVirtualStickCommand(leftX, leftY, rightX, rightY);
export const setVirtualStickModeEnabled = (enabled) => ExpoDjiSdkModule.setVirtualStickModeEnabled(enabled);
export const setVirtualStickControlMode = (rollPitchMode, yawMode, verticalMode, coordinateSystem) => ExpoDjiSdkModule.setVirtualStickControlMode(rollPitchMode, yawMode, verticalMode, coordinateSystem);
// Takeoff and Landing
export const startTakeoff = () => ExpoDjiSdkModule.startTakeoff();
export const startLanding = () => ExpoDjiSdkModule.startLanding();
export const cancelLanding = () => ExpoDjiSdkModule.cancelLanding();
export const confirmLanding = () => ExpoDjiSdkModule.confirmLanding();
export const isLandingConfirmationNeeded = () => ExpoDjiSdkModule.isLandingConfirmationNeeded();
// Flight Status and Readiness
export const getFlightStatus = () => ExpoDjiSdkModule.getFlightStatus();
export const isReadyForTakeoff = () => ExpoDjiSdkModule.isReadyForTakeoff();
export const getPreflightReport = () => ExpoDjiSdkModule.getPreflightReport();
// Calibration
export const startCompassCalibration = () => ExpoDjiSdkModule.startCompassCalibration();
export const getCompassCalibrationStatus = () => ExpoDjiSdkModule.getCompassCalibrationStatus();
export const getCompassHealth = () => ExpoDjiSdkModule.getCompassHealth();
// Altitude and GPS
export const getAltitude = () => ExpoDjiSdkModule.getAltitude();
export const getGPSLocation = () => ExpoDjiSdkModule.getGPSLocation();
// Intelligent Flight - FlyTo Mission
export const startFlyToMission = (latitude, longitude, altitude, maxSpeed) => ExpoDjiSdkModule.startFlyToMission(latitude, longitude, altitude, maxSpeed);
export const stopFlyToMission = () => ExpoDjiSdkModule.stopFlyToMission();
export const getFlyToMissionInfo = () => ExpoDjiSdkModule.getFlyToMissionInfo();
// Waypoint Mission
export const isWaypointMissionSupported = () => ExpoDjiSdkModule.isWaypointMissionSupported();
export const getWaypointMissionState = () => ExpoDjiSdkModule.getWaypointMissionState();
export const loadWaypointMissionFromKML = (filePath) => ExpoDjiSdkModule.loadWaypointMissionFromKML(filePath);
export const generateTestWaypointMission = (latitude, longitude) => ExpoDjiSdkModule.generateTestWaypointMission(latitude, longitude);
export const getControllerInfo = () => ExpoDjiSdkModule.getControllerInfo();
export const convertKMLToKMZ = (kmlPath, heightMode) => ExpoDjiSdkModule.convertKMLToKMZ(kmlPath, heightMode);
export const validateKMZFile = (kmzPath) => ExpoDjiSdkModule.validateKMZFile(kmzPath);
export const uploadKMZToAircraft = (kmzPath) => ExpoDjiSdkModule.uploadKMZToAircraft(kmzPath);
export const getAvailableWaylines = (kmzPath) => ExpoDjiSdkModule.getAvailableWaylines(kmzPath);
export const startWaypointMission = (missionFileName) => ExpoDjiSdkModule.startWaypointMission(missionFileName);
export const stopWaypointMission = (missionFileName) => ExpoDjiSdkModule.stopWaypointMission(missionFileName);
export const pauseWaypointMission = () => ExpoDjiSdkModule.pauseWaypointMission();
export const resumeWaypointMission = () => ExpoDjiSdkModule.resumeWaypointMission();
// Camera Stream
export const getAvailableCameras = () => ExpoDjiSdkModule.getAvailableCameras();
export const enableCameraStream = (cameraIndex) => ExpoDjiSdkModule.enableCameraStream(cameraIndex);
export const disableCameraStream = (cameraIndex) => ExpoDjiSdkModule.disableCameraStream(cameraIndex);
export const getCameraStreamStatus = (cameraIndex) => ExpoDjiSdkModule.getCameraStreamStatus(cameraIndex);
export const getCameraStreamInfo = (cameraIndex) => ExpoDjiSdkModule.getCameraStreamInfo(cameraIndex);
// KML Mission Management
export const previewKMLMissionFromContent = (kmlContent) => ExpoDjiSdkModule.previewKMLMissionFromContent(kmlContent);
export const convertKMLContentToKMZ = (kmlContent) => ExpoDjiSdkModule.convertKMLContentToKMZ(kmlContent);
export const importAndExecuteKMLFromContent = (kmlContent, options) => ExpoDjiSdkModule.importKMLMissionFromContent(kmlContent, options);
export const importKMLMissionFromContent = (kmlContent, options) => ExpoDjiSdkModule.importKMLMissionFromContent(kmlContent, options);
export const pauseKMLMission = () => ExpoDjiSdkModule.pauseKMLMission();
export const resumeKMLMission = () => ExpoDjiSdkModule.resumeKMLMission();
export const stopKMLMission = () => ExpoDjiSdkModule.stopKMLMission();
export const getKMLMissionStatus = () => ExpoDjiSdkModule.getKMLMissionStatus();
// Debug Logging
export const enableDebugLogging = (enabled) => ExpoDjiSdkModule.enableDebugLogging(enabled);
export const getDebugLogs = () => ExpoDjiSdkModule.getDebugLogs();
export const clearDebugLogs = () => ExpoDjiSdkModule.clearDebugLogs();
export const setCameraMode = (mode) => ExpoDjiSdkModule.setCameraMode(mode);
export const shootPhoto = () => ExpoDjiSdkModule.shootPhoto();
export const startPhotoSession = (sessionId, intervalMs) => ExpoDjiSdkModule.startPhotoSession(sessionId, intervalMs);
export const stopPhotoSession = () => ExpoDjiSdkModule.stopPhotoSession();
export const getActivePhotoSession = () => ExpoDjiSdkModule.getActivePhotoSession();
export const downloadSessionPhotos = (sessionId) => ExpoDjiSdkModule.downloadSessionPhotos(sessionId);
export const listCaptureSessions = () => ExpoDjiSdkModule.listCaptureSessions();
export const listCapturesInSession = (sessionId) => ExpoDjiSdkModule.listCapturesInSession(sessionId);
export const deleteCapture = (path) => ExpoDjiSdkModule.deleteCapture(path);
// Gimbal — absolute pitch in degrees. Down is negative: setGimbalPitch(-60)
// points the camera 60° toward the ground for inspection.
export const setGimbalPitch = (degrees) => ExpoDjiSdkModule.setGimbalPitch(degrees);
//# sourceMappingURL=index.js.map