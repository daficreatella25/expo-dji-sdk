import { requireNativeView } from 'expo';
import * as React from 'react';
const NativeCameraStreamView = requireNativeView('ExpoDjiSdk');
export default function CameraStreamView(props) {
    return <NativeCameraStreamView {...props}/>;
}
//# sourceMappingURL=CameraStreamView.js.map