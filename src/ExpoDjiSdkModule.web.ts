import { registerWebModule, NativeModule } from 'expo';

import { ExpoDjiSdkModuleEvents } from './ExpoDjiSdk.types';

class ExpoDjiSdkModule extends NativeModule<ExpoDjiSdkModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(ExpoDjiSdkModule, 'ExpoDjiSdkModule');
