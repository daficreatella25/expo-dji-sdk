import { NativeModule } from 'expo';
import { ExpoDjiSdkModuleEvents, SDKInitializationResult, SDKTestResult, DroneConnectionStatus, VirtualStickState, DetailedDroneInfo, CameraStreamStatus, CameraStreamInfo, CameraIndex, FlightStatus, ReadinessCheck, CompassCalibrationStatus, CompassHealth, PreflightReport, AltitudeInfo, GPSLocation, FlyToMissionInfo, FlyToResult, WaypointMissionSupport, WaypointMissionState, WaypointMissionLoadResult, WaypointMissionResult, KMLMissionConfig, KMLMissionPreview, KMLMissionResult, KMLMissionStatus, ReturnToStartState, DroneTelemetry } from './ExpoDjiSdk.types';
declare class ExpoDjiSdkModule extends NativeModule<ExpoDjiSdkModuleEvents> {
    testSDKClass(): Promise<SDKTestResult>;
    initializeSDK(): Promise<SDKInitializationResult>;
    isDroneConnected(): Promise<DroneConnectionStatus>;
    getDroneInfo(): Promise<boolean>;
    getDetailedDroneInfo(): Promise<DetailedDroneInfo>;
    enableVirtualStick(): Promise<{
        success: boolean;
    }>;
    disableVirtualStick(): Promise<{
        success: boolean;
    }>;
    getVirtualStickState(): Promise<VirtualStickState>;
    getVirtualStickStatus(): Promise<{
        speedLevel: number;
        note: string;
        suggestion: string;
    }>;
    sendVirtualStickCommand(leftX: number, leftY: number, rightX: number, rightY: number): Promise<{
        success: boolean;
    }>;
    setVirtualStickModeEnabled(enabled: boolean): Promise<{
        success: boolean;
        enabled: boolean;
    }>;
    setVirtualStickControlMode(rollPitchMode: string, yawMode: string, verticalMode: string, coordinateSystem: string): Promise<{
        success: boolean;
        mode?: string;
    }>;
    startTakeoff(): Promise<{
        success: boolean;
        message: string;
    }>;
    startLanding(): Promise<{
        success: boolean;
        message: string;
    }>;
    cancelLanding(): Promise<{
        success: boolean;
        message: string;
    }>;
    confirmLanding(): Promise<{
        success: boolean;
        message: string;
    }>;
    isLandingConfirmationNeeded(): Promise<{
        isNeeded: boolean;
        success: boolean;
        error?: string;
    }>;
    /** Latest 1 Hz telemetry snapshot (onTelemetry); null before the first connection. */
    getTelemetry(): DroneTelemetry | null;
    getFlightStatus(): Promise<FlightStatus>;
    isReadyForTakeoff(): Promise<ReadinessCheck>;
    getPreflightReport(): Promise<PreflightReport>;
    startCompassCalibration(): Promise<{
        success: boolean;
        message: string;
        startedAt?: number;
    }>;
    stopCompassCalibration(): Promise<{
        success: boolean;
    }>;
    stopWatchingCompassCalibration(): void;
    startReturnToStart(options?: {
        autoLandAfterMs?: number;
    }): Promise<ReturnToStartState>;
    pauseReturnToStart(): Promise<ReturnToStartState>;
    resumeReturnToStart(): Promise<ReturnToStartState>;
    landReturnToStart(): Promise<ReturnToStartState>;
    confirmReturnLanding(): Promise<ReturnToStartState>;
    cancelReturnToStart(): Promise<ReturnToStartState>;
    getReturnToStartState(): ReturnToStartState;
    getCompassCalibrationStatus(): Promise<CompassCalibrationStatus>;
    getCompassHealth(): Promise<CompassHealth>;
    getAltitude(): Promise<AltitudeInfo>;
    getGPSLocation(): Promise<GPSLocation>;
    startFlyToMission(latitude: number, longitude: number, altitude: number, maxSpeed: number): Promise<FlyToResult>;
    stopFlyToMission(): Promise<FlyToResult>;
    getFlyToMissionInfo(): Promise<FlyToMissionInfo>;
    isWaypointMissionSupported(): Promise<WaypointMissionSupport>;
    getWaypointMissionState(): Promise<WaypointMissionState>;
    loadWaypointMissionFromKML(filePath: string): Promise<WaypointMissionLoadResult>;
    generateTestWaypointMission(latitude?: number, longitude?: number): Promise<WaypointMissionLoadResult>;
    getControllerInfo(): Promise<any>;
    convertKMLToKMZ(kmlPath: string, heightMode: string): Promise<any>;
    validateKMZFile(kmzPath: string): Promise<any>;
    uploadKMZToAircraft(kmzPath: string): Promise<any>;
    getAvailableWaylines(kmzPath: string): Promise<any>;
    startWaypointMission(missionFileName?: string): Promise<WaypointMissionResult>;
    stopWaypointMission(missionFileName?: string): Promise<WaypointMissionResult>;
    pauseWaypointMission(): Promise<WaypointMissionResult>;
    resumeWaypointMission(): Promise<WaypointMissionResult>;
    getAvailableCameras(): Promise<CameraIndex[]>;
    enableCameraStream(cameraIndex: number): Promise<{
        success: boolean;
        message?: string;
    }>;
    disableCameraStream(cameraIndex: number): Promise<{
        success: boolean;
        message?: string;
    }>;
    getCameraStreamStatus(cameraIndex: number): Promise<CameraStreamStatus>;
    getCameraStreamInfo(cameraIndex: number): Promise<CameraStreamInfo>;
    importKMLMission(kmlFilePath: string, options?: KMLMissionConfig): Promise<KMLMissionResult>;
    previewKMLMission(kmlFilePath: string): Promise<KMLMissionPreview>;
    importKMLMissionFromContent(kmlContent: string, options?: KMLMissionConfig): Promise<KMLMissionResult>;
    previewKMLMissionFromContent(kmlContent: string): Promise<KMLMissionPreview>;
    /** Resolves { success: false, message } when it could not pause. */
    pauseKMLMission(): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Resolves once the sticks are taken again, or { success: false, message }
     * when DJI is flying its own return/landing, the drone is not flying, or
     * DJI would not hand the sticks back (the route then fails).
     */
    resumeKMLMission(): Promise<{
        success: boolean;
        message: string;
    }>;
    /** Ends the route (missionStopped): the drone hovers, the remote has control, the shutter stops. */
    stopKMLMission(): Promise<{
        success: boolean;
        message: string;
    }>;
    getKMLMissionStatus(): Promise<KMLMissionStatus>;
    startPhotoSession(sessionId: string, intervalMs: number, options: {
        resume?: boolean;
    }): Promise<{
        success: boolean;
        sessionId: string;
        intervalMs: number;
    }>;
    pausePhotoSession(): Promise<{
        success: boolean;
        reason?: string;
    }>;
    resumePhotoSession(): Promise<{
        success: boolean;
        reason?: string;
    }>;
    downloadSessionPhotos(sessionId: string): Promise<{
        downloaded: number;
        skipped: number;
        failed: number;
    }>;
    cancelPhotoDownload(): Promise<{
        success: boolean;
    }>;
}
declare const _default: ExpoDjiSdkModule;
export default _default;
//# sourceMappingURL=ExpoDjiSdkModule.d.ts.map