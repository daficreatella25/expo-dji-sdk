import { requireNativeView } from 'expo';
import * as React from 'react';

import { ExpoDjiSdkViewProps } from './ExpoDjiSdk.types';

const NativeView: React.ComponentType<ExpoDjiSdkViewProps> =
  requireNativeView('ExpoDjiSdk');

export default function ExpoDjiSdkView(props: ExpoDjiSdkViewProps) {
  return <NativeView {...props} />;
}
