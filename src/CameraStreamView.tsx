import { requireNativeView } from 'expo';
import * as React from 'react';

export interface CameraStreamViewProps {
  cameraIndex: number;
  streamEnabled: boolean;
  scaleType?: number;
  style?: any;
}

const NativeCameraStreamView: React.ComponentType<CameraStreamViewProps> =
  requireNativeView('ExpoDjiSdk');

export default function CameraStreamView(props: CameraStreamViewProps) {
  return <NativeCameraStreamView {...props} />;
}