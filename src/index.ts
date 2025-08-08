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
export const sendVirtualStickCommand = (leftX: number, leftY: number, rightX: number, rightY: number) => 
  ExpoDjiSdkModule.sendVirtualStickCommand(leftX, leftY, rightX, rightY);
export const setVirtualStickModeEnabled = (enabled: boolean) => ExpoDjiSdkModule.setVirtualStickModeEnabled(enabled);
export const setVirtualStickControlMode = (rollPitchMode: string, yawMode: string, verticalMode: string, coordinateSystem: string) => 
  ExpoDjiSdkModule.setVirtualStickControlMode(rollPitchMode, yawMode, verticalMode, coordinateSystem);

// Takeoff and Landing
export const startTakeoff = () => ExpoDjiSdkModule.startTakeoff();
export const startLanding = () => ExpoDjiSdkModule.startLanding();
export const cancelLanding = () => ExpoDjiSdkModule.cancelLanding();

// Flight Status and Readiness
export const getFlightStatus = () => ExpoDjiSdkModule.getFlightStatus();
export const isReadyForTakeoff = () => ExpoDjiSdkModule.isReadyForTakeoff();

// Calibration
export const startCompassCalibration = () => ExpoDjiSdkModule.startCompassCalibration();
export const getCompassCalibrationStatus = () => ExpoDjiSdkModule.getCompassCalibrationStatus();

// Altitude
export const getAltitude = () => ExpoDjiSdkModule.getAltitude();

// Camera Stream
export const getAvailableCameras = () => ExpoDjiSdkModule.getAvailableCameras();
export const enableCameraStream = (cameraIndex: number) => ExpoDjiSdkModule.enableCameraStream(cameraIndex);
export const disableCameraStream = (cameraIndex: number) => ExpoDjiSdkModule.disableCameraStream(cameraIndex);
export const getCameraStreamStatus = (cameraIndex: number) => ExpoDjiSdkModule.getCameraStreamStatus(cameraIndex);
export const getCameraStreamInfo = (cameraIndex: number) => ExpoDjiSdkModule.getCameraStreamInfo(cameraIndex);
