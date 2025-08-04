import * as React from 'react';

import { ExpoDjiSdkViewProps } from './ExpoDjiSdk.types';

export default function ExpoDjiSdkView(props: ExpoDjiSdkViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url || ''}
        onLoad={() => props.onLoad?.({ nativeEvent: { url: props.url || '' } })}
      />
    </div>
  );
}
