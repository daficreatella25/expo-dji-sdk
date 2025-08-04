# expo-dji-sdk

Expo integration with DJI MSDK V5 with automatic API key injection

## 🚀 Quick Start

1. Install the package:
```bash
npm install expo-dji-sdk
```

2. Add your DJI API key to `app.json`:
```json
{
  "expo": {
    "plugins": [
      [
        "expo-dji-sdk", 
        { 
          "apiKey": "YOUR_DJI_API_KEY_HERE" 
        }
      ]
    ]
  }
}
```

3. Prebuild and use:
```bash
expo prebuild
```

✅ **No manual Android manifest or MainApplication editing required!**

For detailed setup instructions, see [PLUGIN_USAGE.md](./PLUGIN_USAGE.md)

# API documentation

- [Documentation for the latest stable release](https://docs.expo.dev/versions/latest/sdk/dji-sdk/)
- [Documentation for the main branch](https://docs.expo.dev/versions/unversioned/sdk/dji-sdk/)

# Installation in managed Expo projects

For [managed](https://docs.expo.dev/archive/managed-vs-bare/) Expo projects, please follow the installation instructions in the [API documentation for the latest stable release](#api-documentation). If you follow the link and there is no documentation available then this library is not yet usable within managed projects &mdash; it is likely to be included in an upcoming Expo SDK release.

# Installation in bare React Native projects

For bare React Native projects, you must ensure that you have [installed and configured the `expo` package](https://docs.expo.dev/bare/installing-expo-modules/) before continuing.

### Add the package to your npm dependencies

```
npm install expo-dji-sdk
```

### Configure for Android




### Configure for iOS

Run `npx pod-install` after installing the npm package.

# Contributing

Contributions are very welcome! Please refer to guidelines described in the [contributing guide]( https://github.com/expo/expo#contributing).
