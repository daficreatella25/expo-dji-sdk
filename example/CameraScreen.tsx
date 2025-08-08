import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import Joystick, { JoystickValue } from './src/components/Joystick';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import ExpoDjiSdk, { 
  getAvailableCameras, 
  enableCameraStream, 
  disableCameraStream, 
  getCameraStreamStatus, 
  getCameraStreamInfo, 
  CameraStreamView,
  startTakeoff,
  startLanding,
  sendVirtualStickCommand,
  setVirtualStickModeEnabled,
  setVirtualStickControlMode,
  getVirtualStickStatus,
  getFlightStatus,
  isReadyForTakeoff,
  getAltitude,
  FlightStatus,
  ReadinessCheck,
  AltitudeInfo
} from 'expo-dji-sdk';
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

  // Flight control states
  const [flightStatus, setFlightStatus] = useState<FlightStatus | null>(null);
  const [virtualStickEnabled, setVirtualStickEnabled] = useState(false);
  const [isFlying, setIsFlying] = useState(false);
  const [readinessStatus, setReadinessStatus] = useState<ReadinessCheck | null>(null);
  const [readinessLevel, setReadinessLevel] = useState<'ready' | 'caution' | 'not_ready'>('not_ready');
  const [altitudeInfo, setAltitudeInfo] = useState<AltitudeInfo | null>(null);

  // Joystick states - simplified
  const [leftJoystickActive, setLeftJoystickActive] = useState(false);
  const [rightJoystickActive, setRightJoystickActive] = useState(false);
  const [currentLeftValue, setCurrentLeftValue] = useState<JoystickValue>({ x: 0, y: 0 });
  const [currentRightValue, setCurrentRightValue] = useState<JoystickValue>({ x: 0, y: 0 });

  // Listen to camera stream status changes
  const onCameraStreamStatusChange = useEvent(ExpoDjiSdk, 'onCameraStreamStatusChange');
  const onAvailableCameraUpdated = useEvent(ExpoDjiSdk, 'onAvailableCameraUpdated');
  
  // Listen to flight events
  const onTakeoffResult = useEvent(ExpoDjiSdk, 'onTakeoffResult');
  const onLandingResult = useEvent(ExpoDjiSdk, 'onLandingResult');
  const onVirtualStickStateChange = useEvent(ExpoDjiSdk, 'onVirtualStickStateChange');
  const onFlightStatusChange = useEvent(ExpoDjiSdk, 'onFlightStatusChange');

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

  // Handle flight events
  useEffect(() => {
    if (onTakeoffResult) {
      addDebugLog(`Takeoff result: ${JSON.stringify(onTakeoffResult)}`);
      if (onTakeoffResult.success) {
        setIsFlying(true);
        Alert.alert('Takeoff', 'Takeoff successful!');
      } else {
        Alert.alert('Takeoff Failed', onTakeoffResult.error || 'Unknown error');
      }
    }
  }, [onTakeoffResult]);

  useEffect(() => {
    if (onLandingResult) {
      addDebugLog(`Landing result: ${JSON.stringify(onLandingResult)}`);
      if (onLandingResult.success) {
        setIsFlying(false);
        setVirtualStickEnabled(false);
        Alert.alert('Landing', 'Landing successful!');
      } else {
        Alert.alert('Landing Failed', onLandingResult.error || 'Unknown error');
      }
    }
  }, [onLandingResult]);

  useEffect(() => {
    if (onVirtualStickStateChange) {
      addDebugLog(`Virtual stick state: ${JSON.stringify(onVirtualStickStateChange)}`);
      if (onVirtualStickStateChange.type === 'stateUpdate' && onVirtualStickStateChange.state) {
        setVirtualStickEnabled(onVirtualStickStateChange.state.isVirtualStickEnabled);
      }
    }
  }, [onVirtualStickStateChange]);

  useEffect(() => {
    if (onFlightStatusChange) {
      addDebugLog(`Flight status: ${JSON.stringify(onFlightStatusChange)}`);
      setFlightStatus(onFlightStatusChange);
      setIsFlying(onFlightStatusChange.isFlying);
    }
  }, [onFlightStatusChange]);

  // Periodically check readiness when not flying, or get altitude when flying
  useEffect(() => {
    if (!isFlying) {
      const interval = setInterval(() => {
        checkReadinessStatus();
      }, 5000); // Check readiness every 5 seconds when not flying

      // Initial check
      checkReadinessStatus();

      return () => clearInterval(interval);
    } else {
      // Get altitude every 2 seconds when flying
      const interval = setInterval(async () => {
        try {
          const altitude = await getAltitude();
          setAltitudeInfo(altitude);
        } catch (error: any) {
          addDebugLog(`Altitude update error: ${error.message}`);
        }
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [isFlying]);

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
      
      // Check if SDK is initialized - with safety check
      let connectionStatus;
      try {
        if (typeof ExpoDjiSdk?.isDroneConnected === 'function') {
          connectionStatus = await ExpoDjiSdk.isDroneConnected();
          addDebugLog(`Connection status: ${JSON.stringify(connectionStatus)}`);
        } else {
          addDebugLog('SDK not available - ExpoDjiSdk.isDroneConnected not a function');
          connectionStatus = { sdkRegistered: false, connected: false };
        }
      } catch (sdkError: any) {
        addDebugLog(`SDK connection check failed: ${sdkError?.message || 'Unknown error'}`);
        connectionStatus = { sdkRegistered: false, connected: false };
      }
      
      if (!connectionStatus?.sdkRegistered) {
        addDebugLog('SDK not registered. Continuing with limited functionality.');
        // Don't throw error, just log and continue
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

  // Flight Control Functions
  const handleTakeoff = async () => {
    try {
      await checkReadinessStatus();
      
      if (readinessLevel === 'not_ready') {
        Alert.alert('Not Ready for Takeoff', readinessStatus?.reason || 'Aircraft not ready');
        return;
      }
      
      if (readinessLevel === 'caution') {
        Alert.alert(
          'Takeoff with Caution',
          `${readinessStatus?.reason || 'Proceed with caution'}\n\nDo you want to continue?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Takeoff Anyway', 
              style: 'destructive',
              onPress: async () => {
                addDebugLog('Starting takeoff with caution...');
                await startTakeoff();
              }
            }
          ]
        );
        return;
      }

      addDebugLog('Starting takeoff...');
      await startTakeoff();
    } catch (error: any) {
      addDebugLog(`Takeoff error: ${error.message}`);
      Alert.alert('Takeoff Error', error.message);
    }
  };

  const handleLanding = async () => {
    try {
      addDebugLog('Starting landing...');
      await startLanding();
    } catch (error: any) {
      addDebugLog(`Landing error: ${error.message}`);
      Alert.alert('Landing Error', error.message);
    }
  };

  const handleEnableVirtualStick = async () => {
    try {
      addDebugLog('Setting up virtual stick mode...');
      
      // Check if functions are available
      if (typeof setVirtualStickControlMode !== 'function' || typeof setVirtualStickModeEnabled !== 'function') {
        addDebugLog('Virtual stick functions not available');
        Alert.alert('Error', 'Virtual stick functions not available. SDK may not be initialized.');
        return;
      }
      
      // First set control modes
      await setVirtualStickControlMode('VELOCITY', 'ANGULAR_VELOCITY', 'VELOCITY', 'GROUND');
      
      // Then enable virtual stick
      await setVirtualStickModeEnabled(true);
      addDebugLog('Virtual stick enabled successfully');
    } catch (error: any) {
      addDebugLog(`Virtual stick error: ${error?.message || 'Unknown error'}`);
      Alert.alert('Virtual Stick Error', error?.message || 'Unknown error');
    }
  };

  const handleDisableVirtualStick = async () => {
    try {
      addDebugLog('Disabling virtual stick...');
      await setVirtualStickModeEnabled(false);
      addDebugLog('Virtual stick disabled successfully');
    } catch (error: any) {
      addDebugLog(`Virtual stick disable error: ${error.message}`);
      Alert.alert('Virtual Stick Error', error.message);
    }
  };

  const handleVirtualStickCommand = async (leftX: number, leftY: number, rightX: number, rightY: number) => {
    if (!virtualStickEnabled) {
      return; // Don't log when disabled to reduce noise
    }
    
    try {
      // Check if sendVirtualStickCommand is available before calling
      if (typeof sendVirtualStickCommand !== 'function') {
        addDebugLog(`sendVirtualStickCommand is not available`);
        return;
      }
      
      await sendVirtualStickCommand(leftX, leftY, rightX, rightY);
    } catch (error: any) {
      addDebugLog(`Virtual stick command error: ${error?.message || 'Unknown error'}`);
    }
  };

  // Joystick event handlers
  const handleLeftJoystickChange = (value: JoystickValue) => {
    setCurrentLeftValue(value);
    // Left stick: X = Yaw, Y = Throttle
    handleVirtualStickCommand(value.x, value.y, currentRightValue.x, currentRightValue.y);
  };

  const handleRightJoystickChange = (value: JoystickValue) => {
    setCurrentRightValue(value);
    // Right stick: X = Roll, Y = Pitch
    handleVirtualStickCommand(currentLeftValue.x, currentLeftValue.y, value.x, value.y);
  };

  const handleLeftJoystickStart = () => {
    setLeftJoystickActive(true);
    addDebugLog('Left joystick activated');
  };

  const handleLeftJoystickEnd = () => {
    setLeftJoystickActive(false);
    addDebugLog('Left joystick released');
  };

  const handleRightJoystickStart = () => {
    setRightJoystickActive(true);
    addDebugLog('Right joystick activated');
  };

  const handleRightJoystickEnd = () => {
    setRightJoystickActive(false);
    addDebugLog('Right joystick released');
  };

  const checkVirtualStickRequirements = async () => {
    try {
      if (typeof getVirtualStickStatus === 'function') {
        const status = await getVirtualStickStatus();
        addDebugLog(`Virtual stick status checked: Speed=${status.speedLevel}`);
        Alert.alert(
          'Virtual Stick Requirements', 
          `Current Speed Level: ${status.speedLevel}\n\n${status.note}\n\nSteps:\n${status.suggestion}`,
          [{ text: 'OK', style: 'default' }]
        );
      } else {
        addDebugLog('getVirtualStickStatus not available');
        Alert.alert('Error', 'Virtual stick status function not available');
      }
    } catch (error: any) {
      addDebugLog(`Status check error: ${error?.message || 'Unknown error'}`);
      Alert.alert('Status Error', error?.message || 'Unknown error');
    }
  };

  const handleGetFlightStatus = async () => {
    try {
      const status = await getFlightStatus();
      setFlightStatus(status);
      setIsFlying(status.isFlying);
      addDebugLog(`Flight status updated: ${JSON.stringify(status)}`);

      // Also get altitude when flying
      if (status.isFlying) {
        try {
          const altitude = await getAltitude();
          setAltitudeInfo(altitude);
          addDebugLog(`Altitude updated: ${altitude.altitude}m`);
        } catch (altError: any) {
          addDebugLog(`Altitude error: ${altError.message}`);
        }
      }
    } catch (error: any) {
      addDebugLog(`Flight status error: ${error.message}`);
    }
  };

  const checkReadinessStatus = async () => {
    try {
      const readiness = await isReadyForTakeoff();
      setReadinessStatus(readiness);
      
      // Determine readiness level based on reason
      if (readiness.ready) {
        setReadinessLevel('ready');
      } else if (readiness.reason.includes('light') || readiness.reason.includes('caution') || readiness.reason.includes('GPS')) {
        setReadinessLevel('caution');
      } else {
        setReadinessLevel('not_ready');
      }
      
      addDebugLog(`Readiness check: ${JSON.stringify(readiness)}`);
    } catch (error: any) {
      addDebugLog(`Readiness check error: ${error.message}`);
      setReadinessLevel('not_ready');
    }
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
        
        {/* Top-Left Flight Controls - Moved higher to avoid navigation bar */}
        <View style={styles.topLeftControls}>
          {/* Readiness Status */}
          {!isFlying && readinessStatus && (
            <View style={[
              styles.readinessContainer,
              readinessLevel === 'ready' ? styles.readinessReady :
              readinessLevel === 'caution' ? styles.readinessCaution : styles.readinessNotReady
            ]}>
              <Text style={styles.readinessText}>
                {readinessLevel === 'ready' ? '✅ READY' : 
                 readinessLevel === 'caution' ? '⚠️ CAUTION' : '❌ NOT READY'}
              </Text>
              <Text style={styles.readinessReason}>{readinessStatus?.reason || 'Checking status...'}</Text>
            </View>
          )}
          
          {/* Takeoff/Landing Buttons */}
          <View style={styles.flightButtonsContainer}>
            {!isFlying ? (
              <TouchableOpacity 
                style={[
                  styles.flightActionButton, 
                  styles.takeoffButton,
                  readinessLevel === 'not_ready' && styles.disabledButton
                ]} 
                onPress={handleTakeoff}
                disabled={readinessLevel === 'not_ready'}
              >
                <Text style={styles.flightActionText}>🚁 TAKEOFF</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={[styles.flightActionButton, styles.landingButton]} 
                onPress={handleLanding}
              >
                <Text style={styles.flightActionText}>🛬 LAND</Text>
              </TouchableOpacity>
            )}
            
            {/* Virtual Stick Toggle */}
            {isFlying && (
              <View style={styles.virtualStickContainer}>
                <TouchableOpacity 
                  style={[
                    styles.virtualStickToggle, 
                    virtualStickEnabled ? styles.virtualStickActive : styles.virtualStickInactive
                  ]} 
                  onPress={virtualStickEnabled ? handleDisableVirtualStick : handleEnableVirtualStick}
                >
                  <Text style={styles.virtualStickToggleText}>
                    {virtualStickEnabled ? '🕹️ VSTICK ON' : '🕹️ VSTICK OFF'}
                  </Text>
                </TouchableOpacity>
                
                {/* Help Button for Virtual Stick Requirements */}
                <TouchableOpacity 
                  style={styles.virtualStickHelpButton}
                  onPress={checkVirtualStickRequirements}
                >
                  <Text style={styles.virtualStickHelpText}>❓</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Top-Right Status Overlay */}
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
              {streamInfo?.width || 0}×{streamInfo?.height || 0} @ {streamInfo?.frameRate || 0}fps
            </Text>
          )}

          {/* Flight Status */}
          {flightStatus && (
            <>
              <Text style={[styles.flightStatusBadge, { backgroundColor: isFlying ? '#00aa00' : '#666' }]}>
                {isFlying ? '✈️ FLYING' : '🛬 GROUND'}
              </Text>
              <Text style={styles.infoBadge}>
                MODE: {flightStatus?.flightMode || 'UNKNOWN'}
              </Text>
              {/* Altitude Display when Flying */}
              {isFlying && altitudeInfo && (
                <Text style={[styles.altitudeBadge]}>
                  📏 {altitudeInfo?.altitude?.toFixed(1) || '0.0'}m
                </Text>
              )}
            </>
          )}
        </View>

        {/* Center Elevation Display - Large and Prominent when Flying */}
        {isFlying && altitudeInfo && (
          <View style={styles.centerElevationDisplay}>
            <Text style={styles.centerElevationText}>
              {altitudeInfo?.altitude?.toFixed(1) || '0.0'} m
            </Text>
            <Text style={styles.centerElevationLabel}>ALTITUDE</Text>
          </View>
        )}

        {/* Virtual Stick Joystick Controls - Always Visible When Enabled */}
        {virtualStickEnabled && (
          <View style={styles.virtualStickControlsOverlay}>
            <View style={styles.joystickLayout}>
              <Joystick
                label="Throttle / Yaw"
                onValueChange={handleLeftJoystickChange}
                onStart={handleLeftJoystickStart}
                onEnd={handleLeftJoystickEnd}
                isActive={leftJoystickActive}
              />
              <Joystick
                label="Roll / Pitch"
                onValueChange={handleRightJoystickChange}
                onStart={handleRightJoystickStart}
                onEnd={handleRightJoystickEnd}
                isActive={rightJoystickActive}
              />
            </View>
          </View>
        )}
      </View>
      
      <View style={styles.controls}>
        <TouchableOpacity style={styles.debugButton} onPress={showDebugAlert}>
          <Text style={styles.debugButtonText}>Debug</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.toggleDebugButton} 
          onPress={() => setShowFullDebug(!showFullDebug)}
        >
          <Text style={styles.debugButtonText}>
            {showFullDebug ? 'Hide' : 'Show'} Logs
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.statusRefreshButton} 
          onPress={handleGetFlightStatus}
        >
          <Text style={styles.debugButtonText}>Refresh</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Text style={styles.backButtonText}>Back</Text>
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
    paddingLeft: 70
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
    bottom: 20, // Move much higher to avoid Android navigation bar
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
    bottom: 20,
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
  // Flight Status Badges
  flightStatusBadge: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 5,
    overflow: 'hidden',
  },
  altitudeBadge: {
    backgroundColor: 'rgba(0, 100, 200, 0.9)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 5,
    overflow: 'hidden',
  },
  
  // Top-Left Flight Controls - Moved to mid-left to avoid navigation bar
  topLeftControls: {
    position: 'absolute',
    top: 20, // Much further down to avoid issues
    left: 60,
    zIndex: 10,
  },
  readinessContainer: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    maxWidth: 200,
  },
  readinessReady: {
    backgroundColor: 'rgba(0, 170, 0, 0.9)',
  },
  readinessCaution: {
    backgroundColor: 'rgba(255, 140, 0, 0.9)',
  },
  readinessNotReady: {
    backgroundColor: 'rgba(220, 20, 60, 0.9)',
  },
  readinessText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  readinessReason: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 14,
  },
  flightButtonsContainer: {
    flexDirection: 'column',
    gap: 8,
  },
  flightActionButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 140,
  },
  flightActionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  takeoffButton: {
    backgroundColor: 'rgba(0, 170, 0, 0.9)',
  },
  landingButton: {
    backgroundColor: 'rgba(255, 100, 0, 0.9)',
  },
  disabledButton: {
    backgroundColor: 'rgba(100, 100, 100, 0.6)',
  },
  virtualStickContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  virtualStickToggle: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
  },
  virtualStickActive: {
    backgroundColor: 'rgba(0, 255, 100, 0.9)',
  },
  virtualStickInactive: {
    backgroundColor: 'rgba(0, 123, 255, 0.9)',
  },
  virtualStickToggleText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  virtualStickHelpButton: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  virtualStickHelpText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },

  // Virtual Stick Controls - Remote Controller Style
  virtualStickControlsOverlay: {
    position: 'absolute',
    bottom: 50, // Move much higher to avoid navigation bar interference
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingVertical: 100,
    paddingHorizontal: 80,
  },
  joystickLayout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  statusRefreshButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
  },

  // Center Elevation Display
  centerElevationDisplay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -50 }, { translateY: -50 }],
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0, 200, 100, 0.8)',
  },
  centerElevationText: {
    color: '#00ff66',
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  centerElevationLabel: {
    color: '#00ff66',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 2,
    marginTop: 4,
  },
});