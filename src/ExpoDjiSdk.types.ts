
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

export type ExpoDjiSdkModuleEvents = {
  onSDKRegistrationResult: (params: SDKInitializationResult) => void;
  onDroneConnectionChange: (params: DroneConnectionPayload) => void;
  onDroneInfoUpdate: (params: DroneInfoUpdatePayload) => void;
  onSDKInitProgress: (params: { event: string; progress: number }) => void;
  onDatabaseDownloadProgress: (params: { current: number; total: number; progress: number }) => void;
  onVirtualStickStateChange: (params: VirtualStickStateChangePayload) => void;
};
