# Expo DJI SDK Plugin Usage

This document explains how to use the Expo DJI SDK with automatic API key injection.

## Installation

```bash
npm install expo-dji-sdk
# or
yarn add expo-dji-sdk
```

## Configuration

### Method 1: Using app.json (Recommended)

Add the plugin to your `app.json` or `app.config.js`:

```json
{
  "expo": {
    "name": "your-app-name",
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

### Method 2: Using app.config.js

```javascript
export default {
  expo: {
    name: 'your-app-name',
    plugins: [
      [
        'expo-dji-sdk',
        {
          apiKey: process.env.DJI_API_KEY || 'YOUR_DJI_API_KEY_HERE',
        },
      ],
    ],
  },
};
```

## What the Plugin Does

The plugin automatically:

1. **Injects your DJI API key** into the Android manifest as `<meta-data android:name="com.dji.sdk.API_KEY" android:value="your-key" />`
2. **Adds DJI SDK initialization** to MainApplication.kt with `com.cySdkyc.clx.Helper.install(this)` in `attachBaseContext`
3. **No manual Android code editing required** - Everything is handled automatically during build
4. **Supports environment variables** - You can use `process.env.DJI_API_KEY` in app.config.js
5. **Idempotent** - Safe to run multiple times, won't duplicate code

## Build Process

After adding the plugin configuration:

1. Run `expo prebuild` to generate native code with the API key injected
2. Build your app normally with `expo build` or EAS Build

## Environment Variables (Recommended)

For security, store your API key in environment variables:

1. Create a `.env` file in your project root:
```
DJI_API_KEY=your_actual_api_key_here
```

2. Use it in `app.config.js`:
```javascript
export default {
  expo: {
    plugins: [
      [
        'expo-dji-sdk',
        {
          apiKey: process.env.DJI_API_KEY,
        },
      ],
    ],
  },
};
```

3. Add `.env` to your `.gitignore` to keep your API key secure

## Usage in Code

```typescript
import ExpoDjiSdk, { initializeSDK, isDroneConnected, getDetailedDroneInfo } from 'expo-dji-sdk';

// Initialize the SDK
const result = await initializeSDK();

// Check drone connection
const connectionStatus = await isDroneConnected();

// Get detailed drone information
const droneInfo = await getDetailedDroneInfo();
```

## Benefits

✅ **No manual Android manifest editing**  
✅ **No manual MainApplication.kt editing**  
✅ **Automatic API key injection**  
✅ **Automatic DJI SDK initialization**  
✅ **Environment variable support**  
✅ **Version control friendly** (no secrets in code)  
✅ **Works with EAS Build**  
✅ **Idempotent and safe** (won't duplicate existing code)  

## Troubleshooting

### Plugin not found
Make sure you've installed the package and run `expo prebuild` after adding the plugin configuration.

### API key not injected
Check that your plugin configuration in app.json/app.config.js is correct and that you've run `expo prebuild`.

### Environment variable issues
Make sure your `.env` file is in the project root and that you're using `app.config.js` (not `app.json`) when using environment variables.