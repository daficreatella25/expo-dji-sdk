import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  PanResponder,
  Dimensions,
} from 'react-native';
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
  cancelLanding,
  sendVirtualStickCommand,
  setVirtualStickModeEnabled,
  setVirtualStickControlMode,
  getFlightStatus,
  isReadyForTakeoff,
  getAltitude,
  FlightStatus,
  ReadinessCheck,
  TakeoffResult,
  LandingResult,
  VirtualStickStateChangePayload,
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

  // Joystick states
  const [leftJoystickActive, setLeftJoystickActive] = useState(false);
  const [rightJoystickActive, setRightJoystickActive] = useState(false);

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
      // First set control modes
      await setVirtualStickControlMode('VELOCITY', 'ANGULAR_VELOCITY', 'VELOCITY', 'GROUND');
      
      // Then enable virtual stick
      await setVirtualStickModeEnabled(true);
      addDebugLog('Virtual stick enabled successfully');
    } catch (error: any) {
      addDebugLog(`Virtual stick error: ${error.message}`);
      Alert.alert('Virtual Stick Error', error.message);
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
      addDebugLog(`Virtual stick disabled - ignoring command`);
      return;
    }
    
    try {
      addDebugLog(`Sending virtual stick command: LX=${leftX.toFixed(2)}, LY=${leftY.toFixed(2)}, RX=${rightX.toFixed(2)}, RY=${rightY.toFixed(2)}`);
      await sendVirtualStickCommand(leftX, leftY, rightX, rightY);
      addDebugLog(`Virtual stick command sent successfully`);
    } catch (error: any) {
      addDebugLog(`Virtual stick command error: ${error.message}`);
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

  // Create joystick component
  const createJoystick = (isLeft: boolean) => {
    const joystickRadius = 60;
    const knobRadius = 25;
    
    const panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      
      onPanResponderGrant: () => {
        if (isLeft) {
          setLeftJoystickActive(true);
          addDebugLog(`Left joystick activated`);
        } else {
          setRightJoystickActive(true);
          addDebugLog(`Right joystick activated`);
        }
      },
      
      onPanResponderMove: (evt, gestureState) => {
        const { dx, dy } = gestureState;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = joystickRadius - knobRadius;
        
        // Limit the knob to the joystick area
        let limitedX = dx;
        let limitedY = dy;
        
        if (distance > maxDistance) {
          limitedX = (dx / distance) * maxDistance;
          limitedY = (dy / distance) * maxDistance;
        }
        
        // Convert to -1 to 1 range
        const normalizedX = limitedX / maxDistance;
        const normalizedY = -limitedY / maxDistance; // Invert Y axis
        
        // Send virtual stick command
        if (isLeft) {
          // Left stick: X = Yaw, Y = Throttle
          handleVirtualStickCommand(normalizedX, normalizedY, 0, 0);
        } else {
          // Right stick: X = Roll, Y = Pitch  
          handleVirtualStickCommand(0, 0, normalizedX, normalizedY);
        }
      },
      
      onPanResponderRelease: () => {
        // Return to center and stop movement
        if (isLeft) {
          setLeftJoystickActive(false);
          handleVirtualStickCommand(0, 0, 0, 0); // Stop all movement
          addDebugLog(`Left joystick released`);
        } else {
          setRightJoystickActive(false);
          handleVirtualStickCommand(0, 0, 0, 0); // Stop all movement
          addDebugLog(`Right joystick released`);
        }
      },
    });
    
    return (
      <View style={styles.joystickContainer}>
        <Text style={styles.joystickLabel}>
          {isLeft ? 'Throttle / Yaw' : 'Roll / Pitch'}
        </Text>
        <View 
          style={[
            styles.joystickArea,
            (isLeft ? leftJoystickActive : rightJoystickActive) && styles.joystickActive
          ]}
          {...panResponder.panHandlers}
        >
          <View style={styles.joystickKnob} />
        </View>
      </View>
    );
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
        
        {/* Top-Left Flight Controls */}
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
              <Text style={styles.readinessReason}>{readinessStatus.reason}</Text>
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
              {streamInfo.width}×{streamInfo.height} @ {streamInfo.frameRate}fps
            </Text>
          )}

          {/* Flight Status */}
          {flightStatus && (
            <>
              <Text style={[styles.flightStatusBadge, { backgroundColor: isFlying ? '#00aa00' : '#666' }]}>
                {isFlying ? '✈️ FLYING' : '🛬 GROUND'}
              </Text>
              <Text style={styles.infoBadge}>
                MODE: {flightStatus.flightMode}
              </Text>
              {/* Altitude Display when Flying */}
              {isFlying && altitudeInfo && (
                <Text style={[styles.altitudeBadge]}>
                  📏 {altitudeInfo.altitude.toFixed(1)}m
                </Text>
              )}
            </>
          )}
        </View>

        {/* Center Elevation Display - Large and Prominent when Flying */}
        {isFlying && altitudeInfo && (
          <View style={styles.centerElevationDisplay}>
            <Text style={styles.centerElevationText}>
              {altitudeInfo.altitude.toFixed(1)} m
            </Text>
            <Text style={styles.centerElevationLabel}>ALTITUDE</Text>
          </View>
        )}

        {/* Virtual Stick Joystick Controls - Always Visible When Enabled */}
        {virtualStickEnabled && (
          <View style={styles.virtualStickControlsOverlay}>
            <View style={styles.joystickLayout}>
              {createJoystick(true)}  {/* Left joystick */}
              {createJoystick(false)} {/* Right joystick */}
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
    bottom: 100, // Move much higher to avoid Android navigation bar
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
  
  // Top-Left Flight Controls
  topLeftControls: {
    position: 'absolute',
    top: 15,
    left: 15,
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
  virtualStickToggle: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
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

  // Virtual Stick Controls - Remote Controller Style
  virtualStickControlsOverlay: {
    position: 'absolute',
    bottom: 160, // Move much higher to avoid navigation bar interference
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingVertical: 20,
    paddingHorizontal: 30,
  },
  joystickLayout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  joystickContainer: {
    alignItems: 'center',
  },
  joystickLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  joystickArea: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  joystickActive: {
    backgroundColor: 'rgba(0, 255, 100, 0.2)',
    borderColor: 'rgba(0, 255, 100, 0.6)',
  },
  joystickKnob: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
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