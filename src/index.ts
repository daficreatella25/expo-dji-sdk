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
export const getFlightStatus = () => ExpoDjiSdkModule.getFlightStatus();
export const isReadyForTakeoff = () => ExpoDjiSdkModule.isReadyForTakeoff();

// Calibration
export const startCompassCalibration = () => ExpoDjiSdkModule.startCompassCalibration();
export const getCompassCalibrationStatus = () => ExpoDjiSdkModule.getCompassCalibrationStatus();

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
