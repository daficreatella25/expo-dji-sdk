// Reexport the native module. On web, it will be resolved to ExpoDjiSdkModule.web.ts
// and on native platforms to ExpoDjiSdkModule.ts
export { default } from './ExpoDjiSdkModule';
export { default as CameraStreamView } from './CameraStreamView';
export * from './ExpoDjiSdk.types';

// Export convenience functions
import ExpoDjiSdkModule from './ExpoDjiSdkModule';

export const testSDKClass = () => ExpoDjiSdkModule.testSDKClass();
export const initializeSDK = () => ExpoDjiSdkModule.initializeSDK();
export const isDroneConnected = () => ExpoDjiSdkModule.isDroneConnected();
export const getDroneInfo = () => ExpoDjiSdkModule.getDroneInfo();
export const getDetailedDroneInfo = () => ExpoDjiSdkModule.getDetailedDroneInfo();
export const getAvailableCameras = () => ExpoDjiSdkModule.getAvailableCameras();
export const enableCameraStream = (cameraIndex: number) => ExpoDjiSdkModule.enableCameraStream(cameraIndex);
export const disableCameraStream = (cameraIndex: number) => ExpoDjiSdkModule.disableCameraStream(cameraIndex);
export const getCameraStreamStatus = (cameraIndex: number) => ExpoDjiSdkModule.getCameraStreamStatus(cameraIndex);
export const getCameraStreamInfo = (cameraIndex: number) => ExpoDjiSdkModule.getCameraStreamInfo(cameraIndex);
