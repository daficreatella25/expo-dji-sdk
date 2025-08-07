import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import ExpoDjiSdk, { getAvailableCameras, enableCameraStream, disableCameraStream, getCameraStreamStatus, getCameraStreamInfo, CameraStreamView } from 'expo-dji-sdk';
import { useEvent } from 'expo';


export default function CameraScreen() {
  const navigation = useNavigation();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamInfo, setStreamInfo] = useState<any>(null);
  const [showFullDebug, setShowFullDebug] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<any[]>([]);
  const [selectedCameraIndex, setSelectedCameraIndex] = useState(0);

  // Listen to camera stream status changes
  const onCameraStreamStatusChange = useEvent(ExpoDjiSdk, 'onCameraStreamStatusChange');
  const onAvailableCameraUpdated = useEvent(ExpoDjiSdk, 'onAvailableCameraUpdated');

  const addDebugLog = (message: string) => {
    console.log(`[CameraScreen] ${message}`);
    setDebugInfo(prev => `${new Date().toLocaleTimeString()}: ${message}\n${prev}`.slice(0, 3000));
  };

  const clearDebugLogs = () => {
    setDebugInfo('');
    addDebugLog('Debug logs cleared');
  };

  const showDebugAlert = () => {
    Alert.alert(
      'Debug Logs',
      debugInfo || 'No debug logs available',
      [
        { text: 'Clear', onPress: clearDebugLogs },
        { text: 'Close', style: 'cancel' }
      ],
      { cancelable: true }
    );
  };

  // Handle camera stream status changes
  useEffect(() => {
    if (onCameraStreamStatusChange) {
      addDebugLog(`Camera stream status: ${JSON.stringify(onCameraStreamStatusChange)}`);
      setIsStreaming(onCameraStreamStatusChange.isEnabled);
      setStreamInfo(onCameraStreamStatusChange.streamInfo);
      
      if (onCameraStreamStatusChange.error) {
        setError(onCameraStreamStatusChange.error);
      }
    }
  }, [onCameraStreamStatusChange]);

  // Handle available camera updates
  useEffect(() => {
    if (onAvailableCameraUpdated) {
      addDebugLog(`Available cameras updated: ${JSON.stringify(onAvailableCameraUpdated)}`);
      setAvailableCameras(onAvailableCameraUpdated.availableCameras || []);
      if (onAvailableCameraUpdated.availableCameras && onAvailableCameraUpdated.availableCameras.length > 0) {
        setSelectedCameraIndex(onAvailableCameraUpdated.availableCameras[0].value);
      }
    }
  }, [onAvailableCameraUpdated]);

  useFocusEffect(
    React.useCallback(() => {
      let isActive = true;

      const setupCamera = async () => {
        try {
          addDebugLog('Setting up camera in landscape mode...');
          
          // Lock screen to landscape
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT);
          addDebugLog('Screen orientation locked to landscape');

          // Initialize camera stream
          await initializeCameraStream();
          
          if (isActive) {
            setIsLoading(false);
            addDebugLog('Camera setup completed successfully');
          }
        } catch (err: any) {
          addDebugLog(`Camera setup error: ${err.message}`);
          if (isActive) {
            setError(err.message);
            setIsLoading(false);
          }
        }
      };

      setupCamera();

      return () => {
        isActive = false;
        cleanupCamera();
      };
    }, [])
  );

  const initializeCameraStream = async () => {
    try {
      addDebugLog('Checking SDK initialization...');
      
      // Check if SDK is initialized
      const connectionStatus = await ExpoDjiSdk.isDroneConnected();
      addDebugLog(`Connection status: ${JSON.stringify(connectionStatus)}`);
      
      if (!connectionStatus.sdkRegistered) {
        throw new Error('SDK not registered. Please initialize SDK first.');
      }

      if (!connectionStatus.connected) {
        addDebugLog('Warning: Drone not connected, but proceeding with camera setup');
      }

      // Get available cameras
      addDebugLog('Getting available cameras...');
      try {
        const cameras = await getAvailableCameras();
        addDebugLog(`Available cameras: ${JSON.stringify(cameras)}`);
        setAvailableCameras(cameras);
        
        if (cameras.length > 0) {
          const firstCamera = cameras[0];
          setSelectedCameraIndex(firstCamera.value);
          addDebugLog(`Selected camera index: ${firstCamera.value} (${firstCamera.name})`);
          
          // Check camera stream status
          addDebugLog(`Checking camera stream status for camera ${firstCamera.value}...`);
          try {
            const streamStatus = await getCameraStreamStatus(firstCamera.value);
            addDebugLog(`Camera stream status: ${JSON.stringify(streamStatus)}`);
            setIsStreaming(streamStatus.isEnabled);
            setStreamInfo(streamStatus.streamInfo);
          } catch (streamError: any) {
            addDebugLog(`Camera stream status check failed: ${streamError.message}`);
          }

          // Try to enable camera stream
          addDebugLog(`Enabling camera stream for camera ${firstCamera.value}...`);
          try {
            const enableResult = await enableCameraStream(firstCamera.value);
            addDebugLog(`Enable camera result: ${JSON.stringify(enableResult)}`);
            
            if (!enableResult.success && enableResult.message) {
              addDebugLog(`Camera stream enable warning: ${enableResult.message}`);
            }
          } catch (enableError: any) {
            addDebugLog(`Enable camera stream error: ${enableError.message}`);
          }

          // Get camera stream info
          try {
            const streamInfo = await getCameraStreamInfo(firstCamera.value);
            addDebugLog(`Camera stream info: ${JSON.stringify(streamInfo)}`);
            setStreamInfo(streamInfo);
          } catch (infoError: any) {
            addDebugLog(`Camera stream info error: ${infoError.message}`);
          }
        } else {
          addDebugLog('No cameras available');
        }
      } catch (cameraError: any) {
        addDebugLog(`Get available cameras error: ${cameraError.message}`);
      }
      
      addDebugLog('Camera stream initialization completed');
      
    } catch (error: any) {
      addDebugLog(`Camera initialization error: ${error.message}`);
      throw error;
    }
  };

  const cleanupCamera = async () => {
    try {
      addDebugLog('Cleaning up camera...');
      
      // Disable camera stream
      if (selectedCameraIndex !== undefined) {
        try {
          const disableResult = await disableCameraStream(selectedCameraIndex);
          addDebugLog(`Disable camera result: ${JSON.stringify(disableResult)}`);
        } catch (disableError: any) {
          addDebugLog(`Disable camera error: ${disableError.message}`);
        }
      }
      
      // Unlock screen orientation back to portrait
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      addDebugLog('Screen orientation unlocked to portrait');
      
    } catch (err: any) {
      console.error('Cleanup error:', err);
      addDebugLog(`Cleanup error: ${err.message}`);
    }
  };

  const handleBackPress = () => {
    addDebugLog('Back button pressed');
    navigation.goBack();
  };

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    setDebugInfo('');
    addDebugLog('Retrying camera setup...');
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.loadingText}>Initializing Camera...</Text>
          <Text style={styles.debugText}>{debugInfo}</Text>
        </View>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.errorTitle}>Camera Error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
          <Text style={styles.debugText}>{debugInfo}</Text>
        </View>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.cameraContainer}>
        <CameraStreamView
          style={styles.cameraStreamView}
          cameraIndex={selectedCameraIndex}
          streamEnabled={isStreaming}
          scaleType={0} // CENTER_INSIDE
        />
        
        <View style={styles.statusOverlay}>
          <Text style={styles.statusBadge}>
            {isStreaming ? '🟢 LIVE' : '🔴 OFF'}
          </Text>
          
          {availableCameras.length > 0 && (
            <Text style={styles.cameraBadge}>
              CAM {selectedCameraIndex}
            </Text>
          )}
          
          {streamInfo && (
            <Text style={styles.infoBadge}>
              {streamInfo.width}×{streamInfo.height} @ {streamInfo.frameRate}fps
            </Text>
          )}
        </View>
      </View>
      
      <View style={styles.controls}>
        <TouchableOpacity style={styles.debugButton} onPress={showDebugAlert}>
          <Text style={styles.debugButtonText}>Show Debug Logs</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.toggleDebugButton} 
          onPress={() => setShowFullDebug(!showFullDebug)}
        >
          <Text style={styles.debugButtonText}>
            {showFullDebug ? 'Hide' : 'Show'} Debug Panel
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Text style={styles.backButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
      
      {showFullDebug && (
        <View style={styles.debugContainer}>
          <Text style={styles.debugTitle}>Live Debug Log:</Text>
          <ScrollView style={styles.debugScrollView}>
            <Text style={styles.debugText}>{debugInfo}</Text>
          </ScrollView>
          <TouchableOpacity style={styles.clearButton} onPress={clearDebugLogs}>
            <Text style={styles.clearButtonText}>Clear Logs</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#222',
    margin: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },
  cameraStreamView: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  statusOverlay: {
    position: 'absolute',
    top: 15,
    right: 15,
    alignItems: 'flex-end',
  },
  controls: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  backButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 20,
  },
  errorTitle: {
    color: '#ff4444',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#ff6600',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
    marginBottom: 20,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  debugContainer: {
    position: 'absolute',
    top: 60,
    left: 10,
    right: 10,
    bottom: 120,
    backgroundColor: 'rgba(0,0,0,0.9)',
    padding: 10,
    borderRadius: 5,
  },
  debugScrollView: {
    flex: 1,
    maxHeight: 200,
  },
  debugTitle: {
    color: '#00ff00',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  debugText: {
    color: '#00ff00',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  statusBadge: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 5,
    overflow: 'hidden',
  },
  cameraBadge: {
    backgroundColor: 'rgba(0,170,255,0.9)',
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 3,
    overflow: 'hidden',
  },
  infoBadge: {
    backgroundColor: 'rgba(100,100,100,0.8)',
    color: '#fff',
    fontSize: 9,
    fontWeight: '500',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  debugButton: {
    backgroundColor: '#ff6600',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
  },
  toggleDebugButton: {
    backgroundColor: '#666',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
  },
  debugButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  clearButton: {
    backgroundColor: '#ff4444',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 3,
    alignSelf: 'flex-end',
    marginTop: 5,
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});