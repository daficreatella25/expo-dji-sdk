import * as React from 'react';
export default function ExpoDjiSdkView(props) {
    return (<div>
      <iframe style={{ flex: 1 }} src={props.url || ''} onLoad={() => props.onLoad?.({ nativeEvent: { url: props.url || '' } })}/>
    </div>);
}
//# sourceMappingURL=ExpoDjiSdkView.web.js.map