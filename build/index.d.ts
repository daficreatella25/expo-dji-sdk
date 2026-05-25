export { default } from './ExpoDjiSdkModule';
export { default as CameraStreamView } from './CameraStreamView';
export * from './ExpoDjiSdk.types';
export declare const testSDKClass: () => Promise<import("./ExpoDjiSdk.types").SDKTestResult>;
export declare const initializeSDK: () => Promise<import("./ExpoDjiSdk.types").SDKInitializationResult>;
export declare const isDroneConnected: () => Promise<import("./ExpoDjiSdk.types").DroneConnectionStatus>;
export declare const getDroneInfo: () => Promise<boolean>;
export declare const getDetailedDroneInfo: () => Promise<import("./ExpoDjiSdk.types").DetailedDroneInfo>;
export declare const enableVirtualStick: () => Promise<{
    success: boolean;
}>;
export declare const disableVirtualStick: () => Promise<{
    success: boolean;
}>;
export declare const getVirtualStickState: () => Promise<import("./ExpoDjiSdk.types").VirtualStickState>;
export declare const getVirtualStickStatus: () => Promise<{
    speedLevel: number;
    note: string;
    suggestion: string;
}>;
export declare const sendVirtualStickCommand: (leftX: number, leftY: number, rightX: number, rightY: number) => Promise<{
    success: boolean;
}>;
export declare const setVirtualStickModeEnabled: (enabled: boolean) => Promise<{
    success: boolean;
    enabled: boolean;
}>;
export declare const setVirtualStickControlMode: (rollPitchMode: string, yawMode: string, verticalMode: string, coordinateSystem: string) => Promise<{
    success: boolean;
    mode?: string;
}>;
export declare const startTakeoff: () => Promise<{
    success: boolean;
    message: string;
}>;
export declare const startLanding: () => Promise<{
    success: boolean;
    message: string;
}>;
export declare const cancelLanding: () => Promise<{
    success: boolean;
    message: string;
}>;
export declare const confirmLanding: () => Promise<{
    success: boolean;
    message: string;
}>;
export declare const isLandingConfirmationNeeded: () => Promise<{
    isNeeded: boolean;
    success: boolean;
    error?: string;
}>;
export declare const getFlightStatus: () => Promise<import("./ExpoDjiSdk.types").FlightStatus>;
export declare const isReadyForTakeoff: () => Promise<import("./ExpoDjiSdk.types").ReadinessCheck>;
export declare const startCompassCalibration: () => Promise<{
    success: boolean;
    message: string;
}>;
export declare const getCompassCalibrationStatus: () => Promise<import("./ExpoDjiSdk.types").CompassCalibrationStatus>;
export declare const getAltitude: () => Promise<import("./ExpoDjiSdk.types").AltitudeInfo>;
export declare const getGPSLocation: () => Promise<import("./ExpoDjiSdk.types").GPSLocation>;
export declare const startFlyToMission: (latitude: number, longitude: number, altitude: number, maxSpeed: number) => Promise<import("./ExpoDjiSdk.types").FlyToResult>;
export declare const stopFlyToMission: () => Promise<import("./ExpoDjiSdk.types").FlyToResult>;
export declare const getFlyToMissionInfo: () => Promise<import("./ExpoDjiSdk.types").FlyToMissionInfo>;
export declare const isWaypointMissionSupported: () => Promise<import("./ExpoDjiSdk.types").WaypointMissionSupport>;
export declare const getWaypointMissionState: () => Promise<import("./ExpoDjiSdk.types").WaypointMissionState>;
export declare const loadWaypointMissionFromKML: (filePath: string) => Promise<import("./ExpoDjiSdk.types").WaypointMissionLoadResult>;
export declare const generateTestWaypointMission: (latitude?: number, longitude?: number) => Promise<import("./ExpoDjiSdk.types").WaypointMissionLoadResult>;
export declare const getControllerInfo: () => Promise<any>;
export declare const convertKMLToKMZ: (kmlPath: string, heightMode: string) => Promise<any>;
export declare const validateKMZFile: (kmzPath: string) => Promise<any>;
export declare const uploadKMZToAircraft: (kmzPath: string) => Promise<any>;
export declare const getAvailableWaylines: (kmzPath: string) => Promise<any>;
export declare const startWaypointMission: (missionFileName?: string) => Promise<import("./ExpoDjiSdk.types").WaypointMissionResult>;
export declare const stopWaypointMission: (missionFileName?: string) => Promise<import("./ExpoDjiSdk.types").WaypointMissionResult>;
export declare const pauseWaypointMission: () => Promise<import("./ExpoDjiSdk.types").WaypointMissionResult>;
export declare const resumeWaypointMission: () => Promise<import("./ExpoDjiSdk.types").WaypointMissionResult>;
export declare const getAvailableCameras: () => Promise<import("./ExpoDjiSdk.types").CameraIndex[]>;
export declare const enableCameraStream: (cameraIndex: number) => Promise<{
    success: boolean;
    message?: string;
}>;
export declare const disableCameraStream: (cameraIndex: number) => Promise<{
    success: boolean;
    message?: string;
}>;
export declare const getCameraStreamStatus: (cameraIndex: number) => Promise<import("./ExpoDjiSdk.types").CameraStreamStatus>;
export declare const getCameraStreamInfo: (cameraIndex: number) => Promise<import("./ExpoDjiSdk.types").CameraStreamInfo>;
export declare const previewKMLMissionFromContent: (kmlContent: string) => Promise<import("./ExpoDjiSdk.types").KMLMissionPreview>;
export declare const convertKMLContentToKMZ: (kmlContent: string) => any;
export declare const importAndExecuteKMLFromContent: (kmlContent: string, options?: any) => Promise<import("./ExpoDjiSdk.types").KMLMissionResult>;
export declare const importKMLMissionFromContent: (kmlContent: string, options?: any) => Promise<import("./ExpoDjiSdk.types").KMLMissionResult>;
export declare const pauseKMLMission: () => Promise<{
    success: boolean;
    message: string;
}>;
export declare const resumeKMLMission: () => Promise<{
    success: boolean;
    message: string;
}>;
export declare const stopKMLMission: () => Promise<{
    success: boolean;
    message: string;
}>;
export declare const getKMLMissionStatus: () => Promise<import("./ExpoDjiSdk.types").KMLMissionStatus>;
export declare const enableDebugLogging: (enabled: boolean) => any;
export declare const getDebugLogs: () => any;
export declare const clearDebugLogs: () => any;
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
}
export declare const setCameraMode: (mode: CameraMode) => any;
export declare const shootPhoto: () => any;
export declare const startPhotoSession: (sessionId: string, intervalMs: number) => any;
export declare const stopPhotoSession: () => any;
export declare const getActivePhotoSession: () => Promise<ActiveSession | null>;
export declare const downloadSessionPhotos: (sessionId: string) => Promise<{
    downloaded: number;
    skipped: number;
}>;
export declare const listCaptureSessions: () => Promise<CaptureSession[]>;
export declare const listCapturesInSession: (sessionId: string) => Promise<CapturedPhoto[]>;
export declare const deleteCapture: (path: string) => Promise<{
    success: boolean;
}>;
export declare const setGimbalPitch: (degrees: number) => Promise<{
    success: boolean;
    pitch: number;
}>;
//# sourceMappingURL=index.d.ts.map