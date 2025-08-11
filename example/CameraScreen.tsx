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
import * as DocumentPicker from 'expo-document-picker';
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
  confirmLanding,
  isLandingConfirmationNeeded,
  sendVirtualStickCommand,
  setVirtualStickModeEnabled,
  setVirtualStickControlMode,
  getVirtualStickStatus,
  getFlightStatus,
  isReadyForTakeoff,
  getAltitude,
  getGPSLocation,
  startFlyToMission,
  stopFlyToMission,
  getFlyToMissionInfo,
  isWaypointMissionSupported,
  getWaypointMissionState,
  loadWaypointMissionFromKML,
  generateTestWaypointMission,
  convertKMLToKMZ,
  validateKMZFile,
  uploadKMZToAircraft,
  getAvailableWaylines,
  startWaypointMission,
  stopWaypointMission,
  pauseWaypointMission,
  resumeWaypointMission,
  FlightStatus,
  ReadinessCheck,
  AltitudeInfo,
  GPSLocation,
  FlyToMissionInfo,
  WaypointMissionSupport,
  WaypointMissionState,
  WaypointMissionLoadResult,
  WaypointMissionResult,
  WaypointMissionUploadProgress
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
  const [gpsLocation, setGpsLocation] = useState<GPSLocation | null>(null);
  
  // FlyTo Mission states
  const [flyToMissionInfo, setFlyToMissionInfo] = useState<FlyToMissionInfo | null>(null);
  const [isFlyToMissionActive, setIsFlyToMissionActive] = useState(false);
  const [isLandingConfirmationRequired, setIsLandingConfirmationRequired] = useState(false);
  
  // Waypoint Mission states
  const [waypointSupported, setWaypointSupported] = useState<boolean | null>(true); // Default to true for testing
  const [waypointMissionState, setWaypointMissionState] = useState<string | null>(null);
  const [waypointMissionActive, setWaypointMissionActive] = useState(false);
  const [waypointKmlPath, setWaypointKmlPath] = useState<string>('');
  const [waypointMissionFileName, setWaypointMissionFileName] = useState<string>('');
  const [kmzUploadProgress, setKmzUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedKmzInfo, setUploadedKmzInfo] = useState<any>(null);

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
  const onWaypointMissionUploadProgress = useEvent(ExpoDjiSdk, 'onWaypointMissionUploadProgress');

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
      // Get altitude and GPS location every 2 seconds when flying
      const interval = setInterval(async () => {
        try {
          const altitude = await getAltitude();
          setAltitudeInfo(altitude);
          
          // Also get GPS location
          const gps = await getGPSLocation();
          setGpsLocation(gps);
          
          // Check if landing confirmation is needed
          const confirmationStatus = await isLandingConfirmationNeeded();
          setIsLandingConfirmationRequired(confirmationStatus.isNeeded);
        } catch (error: any) {
          addDebugLog(`Flight data update error: ${error.message}`);
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
      // First check if landing confirmation is needed
      const confirmationStatus = await isLandingConfirmationNeeded();
      
      if (confirmationStatus.isNeeded) {
        // Landing confirmation is needed - show specific options
        Alert.alert(
          'Landing Confirmation Required',
          'The drone requires landing confirmation. Choose an action:',
          [
            {
              text: 'Confirm Landing',
              onPress: () => performLanding('confirm'),
            },
            {
              text: 'Cancel Landing',
              onPress: () => performLanding('cancel'),
              style: 'destructive',
            },
            {
              text: 'Cancel',
              style: 'cancel',
            },
          ],
          { cancelable: true }
        );
      } else {
        // No confirmation needed - show normal landing options
        Alert.alert(
          'Landing Options',
          'Choose landing method:',
          [
            {
              text: 'Normal Landing',
              onPress: () => performLanding('normal'),
            },
            {
              text: 'Cancel',
              style: 'cancel',
            },
          ],
          { cancelable: true }
        );
      }
    } catch (error: any) {
      addDebugLog(`Landing check error: ${error.message}`);
      // Fallback to normal landing if check fails
      performLanding('normal');
    }
  };

  const performLanding = async (type: 'normal' | 'confirm' | 'cancel') => {
    try {
      let result;
      
      switch (type) {
        case 'normal':
          addDebugLog('Starting normal landing...');
          result = await startLanding();
          // Start auto-confirmation monitoring for normal landing
          if (result?.success) {
            startLandingConfirmationMonitoring();
          }
          break;
        case 'confirm':
          addDebugLog('Confirming landing...');
          result = await confirmLanding();
          break;
        case 'cancel':
          addDebugLog('Cancelling landing...');
          result = await cancelLanding();
          break;
      }
      
      if (result?.success) {
        addDebugLog(`${type} landing completed successfully`);
      }
    } catch (error: any) {
      addDebugLog(`${type} landing error: ${error.message}`);
      Alert.alert('Landing Error', error.message);
    }
  };

  const startLandingConfirmationMonitoring = () => {
    const confirmationInterval = setInterval(async () => {
      try {
        const confirmationStatus = await isLandingConfirmationNeeded();
        const flightStatus = await getFlightStatus();
        
        if (confirmationStatus.isNeeded && flightStatus.isFlying) {
          // Auto-confirm landing when confirmation is needed
          addDebugLog('Auto-confirming landing...');
          await confirmLanding();
        }
        
        // Stop monitoring when motors are off (landed)
        if (!flightStatus.areMotorsOn) {
          clearInterval(confirmationInterval);
          addDebugLog('Landing monitoring stopped - motors off');
        }
      } catch (error: any) {
        addDebugLog(`Landing monitoring error: ${error.message}`);
      }
    }, 1000); // Check every second during landing

    // Safety timeout to stop monitoring after 2 minutes
    setTimeout(() => {
      clearInterval(confirmationInterval);
      addDebugLog('Landing monitoring timeout - stopped after 2 minutes');
    }, 120000);
  };

  // Virtual Stick Autonomous Flight - Your specific coordinates
  const TARGET_COORDINATES = {
    latitude: 112.69747710061603,
    longitude: -7.425990014912149,
    altitude: 6.0, // 6 meters height as requested
    maxSpeed: 0.5 // Virtual stick speed (0.0 to 1.0)
  };

  const [autonomousFlightActive, setAutonomousFlightActive] = useState(false);
  const [autonomousFlightPaused, setAutonomousFlightPaused] = useState(false);
  const [autonomousFlightInterval, setAutonomousFlightInterval] = useState<NodeJS.Timeout | null>(null);

  const handleStartAutonomousFlight = async () => {
    try {
      if (!isFlying) {
        Alert.alert('Flight Required', 'Please takeoff first before starting autonomous flight');
        return;
      }
      
      if (!virtualStickEnabled) {
        Alert.alert('Virtual Stick Required', 'Please enable Virtual Stick first');
        return;
      }
      
      addDebugLog(`Starting autonomous flight to: ${TARGET_COORDINATES.latitude}, ${TARGET_COORDINATES.longitude} at ${TARGET_COORDINATES.altitude}m`);
      
      setAutonomousFlightActive(true);
      startAutonomousFlightToTarget();
      
      Alert.alert('Autonomous Flight', 'Virtual stick autonomous flight started!');
    } catch (error: any) {
      addDebugLog(`Autonomous flight start error: ${error.message}`);
      Alert.alert('Autonomous Flight Error', error.message);
    }
  };

  const handlePauseAutonomousFlight = () => {
    try {
      if (autonomousFlightPaused) {
        // Resume flight
        addDebugLog('Resuming autonomous flight...');
        setAutonomousFlightPaused(false);
        Alert.alert('Autonomous Flight', 'Flight resumed');
      } else {
        // Pause flight
        addDebugLog('Pausing autonomous flight...');
        setAutonomousFlightPaused(true);
        
        // Stop the drone by sending zero commands
        sendVirtualStickCommand(0, 0, 0, 0);
        
        Alert.alert('Autonomous Flight', 'Flight paused');
      }
    } catch (error: any) {
      addDebugLog(`Autonomous flight pause error: ${error.message}`);
      Alert.alert('Autonomous Flight Error', error.message);
    }
  };

  const handleStopAutonomousFlight = () => {
    try {
      addDebugLog('Stopping autonomous flight...');
      
      if (autonomousFlightInterval) {
        clearInterval(autonomousFlightInterval);
        setAutonomousFlightInterval(null);
      }
      
      setAutonomousFlightActive(false);
      setAutonomousFlightPaused(false);
      
      // Stop the drone by sending zero commands
      sendVirtualStickCommand(0, 0, 0, 0);
      
      addDebugLog('Autonomous flight stopped');
      Alert.alert('Autonomous Flight', 'Virtual stick autonomous flight stopped');
    } catch (error: any) {
      addDebugLog(`Autonomous flight stop error: ${error.message}`);
      Alert.alert('Autonomous Flight Error', error.message);
    }
  };

  // Waypoint Mission Functions
  const handleCheckWaypointSupport = async () => {
    try {
      addDebugLog('Checking waypoint mission support...');
      const result = await isWaypointMissionSupported();
      setWaypointSupported(result.isSupported);
      
      if (result.success) {
        Alert.alert(
          'Waypoint Mission Support', 
          result.isSupported 
            ? '✅ Waypoint missions are supported on this drone' 
            : '❌ Waypoint missions are not supported on this drone'
        );
        addDebugLog(`Waypoint support: ${result.isSupported}`);
        
        // Also get current state if supported
        if (result.isSupported) {
          const stateResult = await getWaypointMissionState();
          if (stateResult.success) {
            setWaypointMissionState(stateResult.state);
            addDebugLog(`Waypoint state: ${stateResult.state}`);
          }
        }
      } else {
        Alert.alert('Waypoint Check Failed', result.error || 'Unknown error');
        addDebugLog(`Waypoint check failed: ${result.error}`);
      }
    } catch (error: any) {
      addDebugLog(`Waypoint check error: ${error.message}`);
      Alert.alert('Waypoint Error', error.message);
    }
  };

  const handleLoadKMLFile = async () => {
    try {
      addDebugLog('Opening file picker for KML file...');
      
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.google-earth.kml+xml', // KML MIME type
          'application/vnd.google-earth.kmz',      // KMZ MIME type
          'application/zip',                       // KMZ is essentially a zip file
          '*/*'                                    // Allow all files as fallback
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      
      addDebugLog(`File picker result: ${JSON.stringify(result)}`);
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedFile = result.assets[0];
        const fileName = selectedFile.name;
        const fileUri = selectedFile.uri;
        
        // Validate file extension
        const isValidFile = fileName.toLowerCase().endsWith('.kml') || 
                           fileName.toLowerCase().endsWith('.kmz');
        
        if (!isValidFile) {
          Alert.alert(
            'Invalid File Type',
            'Please select a .kml or .kmz file for waypoint missions.\n\n' +
            'Note: .kmz files (compressed) are preferred for better compatibility.',
            [
              { text: 'Try Again', onPress: handleLoadKMLFile },
              { text: 'Cancel', style: 'cancel' }
            ]
          );
          return;
        }
        
        addDebugLog(`Selected KML file: ${fileName} at ${fileUri}`);
        
        const fileType = fileName.toLowerCase().endsWith('.kmz') ? 'KMZ' : 'KML';
        const sizeKB = ((selectedFile.size || 0) / 1024).toFixed(1);
        
        Alert.alert(
          `${fileType} Waypoint File Selected`,
          `📁 File: ${fileName}\n📏 Size: ${sizeKB} KB\n\n` +
          `${fileType === 'KML' ? '⚠️ KML files will be converted to KMZ format.\n\n' : ''}` +
          'Load this waypoint mission?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: `Load ${fileType} Mission`, onPress: () => loadWaypointKML(fileUri) }
          ]
        );
      } else {
        addDebugLog('File picker cancelled by user');
      }
    } catch (error: any) {
      addDebugLog(`File picker error: ${error.message}`);
      
      // Fallback to manual path entry
      Alert.alert(
        'File Picker Error',
        `Could not open file picker: ${error.message}\n\nWould you like to enter the file path manually?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enter Path',
            onPress: () => {
              Alert.prompt(
                'Enter Waypoint File Path',
                'Full path to your .kml or .kmz file:',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'Load', 
                    onPress: (path) => {
                      if (path && path.trim()) loadWaypointKML(path.trim());
                    }
                  }
                ],
                'plain-text',
                '/storage/emulated/0/Download/waypoints.kmz'
              );
            }
          }
        ]
      );
    }
  };

  const loadWaypointKML = async (filePath: string) => {
    try {
      addDebugLog(`Loading KML file from: ${filePath}`);
      
      // Show loading state
      Alert.alert('Loading...', 'Loading waypoints from KML file...');
      
      const result = await loadWaypointMissionFromKML(filePath);
      
      if (result.success) {
        const waypointCount = result.waypointCount || 0;
        const message = result.message || 'KML file loaded successfully';
        
        const finalFilePath = result.filePath || filePath;
        const fileName = finalFilePath.split('/').pop() || 'waypoint_mission.kmz';
        const fileType = fileName.toLowerCase().endsWith('.kmz') ? 'KMZ' : 'KML';
        
        Alert.alert(
          `${fileType} Mission Uploaded Successfully ✅`,
          `${message}\n\n📍 Waypoints found: ${waypointCount}\n📁 File: ${fileName}\n🗏 Type: ${fileType} Mission\n\n✓ Mission uploaded to aircraft successfully!\n\nYou can now start the mission when ready to fly.`,
          [
            { text: 'OK', style: 'default' },
            { 
              text: 'Start Mission', 
              onPress: handleStartWaypointMission,
              style: 'default'
            }
          ]
        );
        
        addDebugLog(`✅ Waypoint mission loaded successfully: ${waypointCount} waypoints`);
        addDebugLog(`📁 Final file path: ${finalFilePath}`);
        
        setWaypointKmlPath(finalFilePath);
        setWaypointMissionFileName(fileName);
        
      } else {
        const errorMsg = result.error || result.message || 'Unknown error occurred';
        Alert.alert(
          'Waypoint Mission Upload Failed ❌', 
          `Could not upload waypoints to aircraft:\n\n${errorMsg}\n\nPossible solutions:\n• Ensure the file is a valid .kmz or .kml file\n• Check file permissions and storage access\n• Verify drone is connected and ready\n• Try a different waypoint mission file\n• Restart the app if needed`,
          [
            { text: 'Try Another File', onPress: handleLoadKMLFile },
            { text: 'Cancel', style: 'cancel' }
          ]
        );
        addDebugLog(`❌ KML load failed: ${errorMsg}`);
      }
    } catch (error: any) {
      addDebugLog(`💥 KML load error: ${error.message}`);
      Alert.alert(
        'Waypoint Mission Error',
        `An error occurred while loading the waypoint file:\n\n${error.message}\n\nPlease ensure:\n• File exists and is accessible\n• App has storage permissions\n• Drone is connected and ready`,
        [
          { text: 'Try Again', onPress: handleLoadKMLFile },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    }
  };

  // Handle waypoint mission upload progress
  useEffect(() => {
    if (onWaypointMissionUploadProgress) {
      const { progress, percentage, status } = onWaypointMissionUploadProgress;
      setKmzUploadProgress(percentage);
      addDebugLog(`Upload progress: ${percentage}% (${status})`);
      
      if (percentage === 100 && status === 'uploading') {
        setIsUploading(false);
        addDebugLog('KMZ upload completed successfully!');
      }
    }
  }, [onWaypointMissionUploadProgress]);

  // Test KML to KMZ conversion and upload (without starting mission)
  const handleTestKMLUpload = async () => {
    try {
      addDebugLog('Opening file picker for KML file testing...');
      
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.google-earth.kml+xml',
          'application/vnd.google-earth.kmz',
          'application/zip',
          '*/*'
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedFile = result.assets[0];
        const fileName = selectedFile.name;
        const fileUri = selectedFile.uri;
        
        if (!fileName.toLowerCase().endsWith('.kml') && !fileName.toLowerCase().endsWith('.kmz')) {
          Alert.alert('Invalid File', 'Please select a .kml or .kmz file');
          return;
        }

        addDebugLog(`Testing file: ${fileName}`);
        await processKMLForUpload(fileUri, fileName);
      }
    } catch (error: any) {
      addDebugLog(`File picker error: ${error.message}`);
      Alert.alert('Error', error.message);
    }
  };

  const processKMLForUpload = async (filePath: string, fileName: string) => {
    try {
      const isKmz = fileName.toLowerCase().endsWith('.kmz');
      let kmzPath = filePath;
      
      // Step 1: Convert KML to KMZ if needed
      if (!isKmz) {
        addDebugLog('Converting KML to KMZ...');
        const conversionResult = await convertKMLToKMZ(filePath, 'RELATIVE');
        
        if (!conversionResult.success) {
          Alert.alert('Conversion Failed', `Failed to convert KML to KMZ: ${conversionResult.validationErrors?.join(', ') || 'Unknown error'}`);
          return;
        }
        
        kmzPath = conversionResult.kmzPath;
        addDebugLog(`✅ KML converted to KMZ: ${kmzPath}`);
        addDebugLog(`Validation: ${conversionResult.isValid ? 'Valid' : 'Invalid'} (Error code: ${conversionResult.errorCode})`);
        
        if (!conversionResult.isValid) {
          Alert.alert(
            'Validation Warning', 
            `KMZ file has validation issues:\n${conversionResult.validationErrors?.join('\n') || 'Unknown validation errors'}\n\nContinue with upload?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Upload Anyway', onPress: () => uploadKMZFile(kmzPath, fileName) }
            ]
          );
          return;
        }
      } else {
        // Step 2: Validate existing KMZ file
        addDebugLog('Validating KMZ file...');
        const validationResult = await validateKMZFile(kmzPath);
        
        addDebugLog(`Validation result: ${validationResult.isValid ? 'Valid' : 'Invalid'} (Error code: ${validationResult.errorCode})`);
        
        if (!validationResult.isValid) {
          Alert.alert(
            'Invalid KMZ File',
            `Validation failed:\n${validationResult.errors?.join('\n') || 'Unknown errors'}\n\nWarnings:\n${validationResult.warnings?.join('\n') || 'None'}`,
            [{ text: 'OK', style: 'cancel' }]
          );
          return;
        }
      }
      
      // Step 3: Upload to aircraft
      await uploadKMZFile(kmzPath, fileName);
      
    } catch (error: any) {
      addDebugLog(`❌ Process error: ${error.message}`);
      Alert.alert('Process Error', error.message);
    }
  };

  const uploadKMZFile = async (kmzPath: string, originalFileName: string) => {
    try {
      setIsUploading(true);
      setKmzUploadProgress(0);
      
      addDebugLog(`🚀 Starting KMZ upload: ${kmzPath}`);
      
      const uploadResult = await uploadKMZToAircraft(kmzPath);
      
      if (uploadResult.success) {
        setUploadedKmzInfo(uploadResult);
        setWaypointKmlPath(kmzPath);
        setWaypointMissionFileName(originalFileName);
        
        Alert.alert(
          '✅ Upload Successful!',
          `Mission uploaded to aircraft:\n\n` +
          `📁 File: ${originalFileName}\n` +
          `📍 Waylines: ${uploadResult.waylineCount || 'Unknown'}\n` +
          `🛩️ Available Waylines: ${uploadResult.availableWaylines?.join(', ') || 'None'}\n\n` +
          `✅ Upload completed successfully!\n` +
          `The mission is now ready to start when drone is flying.`,
          [
            { text: 'OK', style: 'default' },
            { text: 'View Waylines', onPress: () => showWaylineInfo(kmzPath) }
          ]
        );
        
        addDebugLog(`✅ Upload successful! Waylines: ${uploadResult.waylineCount}`);
      } else {
        Alert.alert('Upload Failed', uploadResult.error || 'Unknown upload error');
        addDebugLog(`❌ Upload failed: ${uploadResult.error}`);
      }
      
    } catch (error: any) {
      addDebugLog(`💥 Upload error: ${error.message}`);
      Alert.alert('Upload Error', error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const showWaylineInfo = async (kmzPath: string) => {
    try {
      const waylineResult = await getAvailableWaylines(kmzPath);
      if (waylineResult.success) {
        Alert.alert(
          'Wayline Information',
          `📍 Total Waylines: ${waylineResult.count}\n` +
          `🗏 Wayline IDs: ${waylineResult.waylineIds.join(', ')}\n\n` +
          `Each wayline represents a flight path segment in your mission.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Failed to get wayline information');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleStartWaypointMission = async () => {
    try {
      if (!waypointMissionFileName) {
        Alert.alert('Mission Required', 'Please load a waypoint mission first');
        return;
      }
      
      // Check if drone is flying for safety warning
      if (!isFlying) {
        Alert.alert(
          'Start Waypoint Mission',
          'Waypoint mission can be started, but the drone should be flying for mission execution.\n\nContinue anyway?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Start Mission', onPress: () => executeWaypointMission() }
          ]
        );
        return;
      }
      
      executeWaypointMission();
    } catch (error: any) {
      addDebugLog(`Waypoint start error: ${error.message}`);
      Alert.alert('Waypoint Start Error', error.message);
    }
  };
  
  const executeWaypointMission = async () => {
    try {
      addDebugLog(`Starting waypoint mission: ${waypointMissionFileName}...`);
      const result = await startWaypointMission(waypointMissionFileName);
      
      if (result.success) {
        setWaypointMissionActive(true);
        Alert.alert('Waypoint Mission', 'Waypoint mission started successfully!');
        addDebugLog('Waypoint mission started');
      } else {
        Alert.alert('Mission Start Failed', result.error || result.message || 'Unknown error');
        addDebugLog(`Mission start failed: ${result.error || result.message}`);
      }
    } catch (error: any) {
      addDebugLog(`Execute waypoint error: ${error.message}`);
      Alert.alert('Waypoint Execute Error', error.message);
    }
  };

  const handlePauseWaypointMission = async () => {
    try {
      addDebugLog('Pausing waypoint mission...');
      const result = await pauseWaypointMission();
      
      if (result.success) {
        Alert.alert('Waypoint Mission', 'Mission paused');
        addDebugLog('Waypoint mission paused');
      } else {
        Alert.alert('Mission Pause Failed', result.error || result.message || 'Unknown error');
        addDebugLog(`Mission pause failed: ${result.error || result.message}`);
      }
    } catch (error: any) {
      addDebugLog(`Waypoint pause error: ${error.message}`);
      Alert.alert('Waypoint Pause Error', error.message);
    }
  };

  const handleResumeWaypointMission = async () => {
    try {
      addDebugLog('Resuming waypoint mission...');
      const result = await resumeWaypointMission();
      
      if (result.success) {
        Alert.alert('Waypoint Mission', 'Mission resumed');
        addDebugLog('Waypoint mission resumed');
      } else {
        Alert.alert('Mission Resume Failed', result.error || result.message || 'Unknown error');
        addDebugLog(`Mission resume failed: ${result.error || result.message}`);
      }
    } catch (error: any) {
      addDebugLog(`Waypoint resume error: ${error.message}`);
      Alert.alert('Waypoint Resume Error', error.message);
    }
  };

  const handleStopWaypointMission = async () => {
    try {
      if (!waypointMissionFileName) {
        Alert.alert('Mission Required', 'No active waypoint mission to stop');
        return;
      }
      
      addDebugLog(`Stopping waypoint mission: ${waypointMissionFileName}...`);
      const result = await stopWaypointMission(waypointMissionFileName);
      
      if (result.success) {
        setWaypointMissionActive(false);
        Alert.alert('Waypoint Mission', 'Mission stopped');
        addDebugLog('Waypoint mission stopped');
      } else {
        Alert.alert('Mission Stop Failed', result.error || result.message || 'Unknown error');
        addDebugLog(`Mission stop failed: ${result.error || result.message}`);
      }
    } catch (error: any) {
      addDebugLog(`Waypoint stop error: ${error.message}`);
      Alert.alert('Waypoint Stop Error', error.message);
    }
  };
  
  const handleGenerateWaypoints = async () => {
    try {
      addDebugLog('Generating test waypoint mission...');
      
      // Use current GPS location if available, otherwise use default coordinates
      const lat = gpsLocation?.isValid ? gpsLocation.latitude : undefined;
      const lon = gpsLocation?.isValid ? gpsLocation.longitude : undefined;
      
      const result = await generateTestWaypointMission(lat, lon);
      
      if (result.success) {
        const fileName = result.filePath?.split('/').pop() || 'generated_mission.kmz';
        
        Alert.alert(
          'Waypoint Mission Generated ✨',
          `✓ Generated test mission successfully!\n\n📍 Waypoints: ${result.waypointCount || 4}\n📁 File: ${fileName}\n🗺 Pattern: 50m x 50m square\n💪 Altitude: 20m\n\n📡 ${lat && lon ? 'Used current GPS location' : 'Used default coordinates'}\n\nReady to upload and test?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Upload & Test', 
              onPress: () => {
                if (result.filePath) {
                  loadWaypointKML(result.filePath);
                }
              }
            }
          ]
        );
        
        addDebugLog(`✨ Generated waypoint mission: ${result.waypointCount} waypoints`);
        addDebugLog(`📁 File path: ${result.filePath}`);
        
      } else {
        Alert.alert(
          'Generation Failed ❌',
          `Could not generate waypoint mission:\n\n${result.error}\n\nPlease check:\n• Drone connection\n• App permissions\n• Storage access`,
          [{ text: 'OK', style: 'default' }]
        );
        addDebugLog(`❌ Generation failed: ${result.error}`);
      }
    } catch (error: any) {
      addDebugLog(`💥 Generate waypoints error: ${error.message}`);
      Alert.alert(
        'Generation Error',
        `An error occurred while generating waypoints:\n\n${error.message}`,
        [{ text: 'OK', style: 'default' }]
      );
    }
  };

  const startAutonomousFlightToTarget = () => {
    const interval = setInterval(async () => {
      try {
        const currentGPS = await getGPSLocation();
        const currentAlt = await getAltitude();
        
        if (!currentGPS.isValid || !autonomousFlightActive) {
          return;
        }
        
        // Skip movement if paused, but continue monitoring
        if (autonomousFlightPaused) {
          addDebugLog('Flight paused - hovering');
          return;
        }
        
        // Calculate distance and bearing to target
        const deltaLat = TARGET_COORDINATES.latitude - currentGPS.latitude;
        const deltaLon = TARGET_COORDINATES.longitude - currentGPS.longitude;
        const deltaAlt = TARGET_COORDINATES.altitude - currentAlt.altitude;
        
        const distance = Math.sqrt(deltaLat * deltaLat + deltaLon * deltaLon) * 111000; // Rough meters
        
        addDebugLog(`Distance to target: ${distance.toFixed(1)}m`);
        
        // Check if we've reached the target (within 2 meters)
        if (distance < 2 && Math.abs(deltaAlt) < 1) {
          handleStopAutonomousFlight();
          Alert.alert('Autonomous Flight', 'Target reached successfully!');
          return;
        }
        
        // Calculate normalized movement commands
        let pitch = Math.sign(deltaLat) * Math.min(Math.abs(deltaLat) * 1000, TARGET_COORDINATES.maxSpeed); // Forward/backward
        let roll = Math.sign(deltaLon) * Math.min(Math.abs(deltaLon) * 1000, TARGET_COORDINATES.maxSpeed);  // Left/right
        let throttle = Math.sign(deltaAlt) * Math.min(Math.abs(deltaAlt) * 0.1, 0.3); // Up/down
        
        // Send virtual stick commands
        await sendVirtualStickCommand(
          0,        // leftX (yaw) - no rotation
          throttle, // leftY (throttle) - vertical movement
          roll,     // rightX (roll) - left/right
          pitch     // rightY (pitch) - forward/backward
        );
        
        addDebugLog(`VStick: pitch=${pitch.toFixed(3)}, roll=${roll.toFixed(3)}, throttle=${throttle.toFixed(3)}`);
        
      } catch (error: any) {
        addDebugLog(`Autonomous flight error: ${error.message}`);
      }
    }, 500); // Update every 500ms for smooth flight
    
    setAutonomousFlightInterval(interval);
    
    // Safety timeout - stop after 5 minutes
    setTimeout(() => {
      if (autonomousFlightActive) {
        handleStopAutonomousFlight();
        Alert.alert('Autonomous Flight', 'Flight stopped - 5 minute safety timeout');
      }
    }, 300000);
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
                style={[
                  styles.flightActionButton, 
                  isLandingConfirmationRequired ? styles.landingConfirmButton : styles.landingButton
                ]} 
                onPress={handleLanding}
              >
                <Text style={styles.flightActionText}>
                  {isLandingConfirmationRequired ? '⚠️ CONFIRM LAND' : '🛬 LAND'}
                </Text>
              </TouchableOpacity>
            )}
            
            {/* Waypoint Mission Controls - Always Available */}
            <View style={styles.waypointMissionPanel}>
              <TouchableOpacity 
                style={[styles.flightActionButton, styles.waypointTestButton]} 
                onPress={handleCheckWaypointSupport}
              >
                <Text style={styles.flightActionText}>📍 WAYPOINT</Text>
              </TouchableOpacity>
              
              {waypointSupported && (
                <View style={styles.waypointControls}>
                  <View style={styles.waypointFileControls}>
                    <TouchableOpacity 
                      style={[styles.flightActionButton, styles.waypointGenerateButton]} 
                      onPress={handleGenerateWaypoints}
                    >
                      <Text style={styles.flightActionText}>✨ GENERATE</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.flightActionButton, styles.waypointStartButton]} 
                      onPress={handleLoadKMLFile}
                    >
                      <Text style={styles.flightActionText}>📂 SELECT KMZ</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.flightActionButton, styles.waypointTestButton, { opacity: isUploading ? 0.6 : 1 }]} 
                      onPress={handleTestKMLUpload}
                      disabled={isUploading}
                    >
                      <Text style={styles.flightActionText}>
                        {isUploading ? `🔄 ${kmzUploadProgress}%` : '🧪 TEST UPLOAD'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  
                  {waypointMissionActive && (
                    <View style={styles.waypointActiveControls}>
                      <TouchableOpacity 
                        style={[styles.flightActionButton, styles.waypointPauseButton]} 
                        onPress={handlePauseWaypointMission}
                      >
                        <Text style={styles.flightActionText}>⏸️ PAUSE</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.flightActionButton, styles.waypointStopButton]} 
                        onPress={handleStopWaypointMission}
                      >
                        <Text style={styles.flightActionText}>⏹️ STOP</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>

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
              {/* GPS Location Display when Flying */}
              {isFlying && gpsLocation && gpsLocation.isValid && (
                <Text style={[styles.gpsBadge]}>
                  🌍 {gpsLocation.latitude.toFixed(6)}, {gpsLocation.longitude.toFixed(6)}
                </Text>
              )}
            </>
          )}
        </View>

        {/* Center Elevation Display - Large and Prominent when Flying */}
        {/* {isFlying && altitudeInfo && (
          <View style={styles.centerElevationDisplay}>
            <Text style={styles.centerElevationText}>
              {altitudeInfo?.altitude?.toFixed(1) || '0.0'} m
            </Text>
            <Text style={styles.centerElevationLabel}>ALTITUDE</Text>
          </View>
        )} */}

        {/* GPS Location Display - Absolute under the live data when flying */}
        {/* {isFlying && gpsLocation && gpsLocation.isValid && (
          <View style={styles.centerGPSDisplay}>
            <Text style={styles.centerGPSText}>
              {gpsLocation.latitude.toFixed(6)}°, {gpsLocation.longitude.toFixed(6)}°
            </Text>
            <Text style={styles.centerGPSLabel}>GPS COORDINATES</Text>
            <Text style={styles.centerGPSAltText}>
              ALT: {gpsLocation.altitude.toFixed(1)}m
            </Text>
          </View>
        )} */}

        {/* Virtual Stick Joystick Controls - Absolutely Positioned */}
        {virtualStickEnabled && (
          <>
            {/* Left Joystick - Throttle / Yaw */}
            <View style={styles.leftJoystickContainer}>
              <Joystick
                label="Throttle / Yaw"
                onValueChange={handleLeftJoystickChange}
                onStart={handleLeftJoystickStart}
                onEnd={handleLeftJoystickEnd}
                isActive={leftJoystickActive}
              />
            </View>
            
            {/* Right Joystick - Roll / Pitch */}
            <View style={styles.rightJoystickContainer}>
              <Joystick
                label="Roll / Pitch"
                onValueChange={handleRightJoystickChange}
                onStart={handleRightJoystickStart}
                onEnd={handleRightJoystickEnd}
                isActive={rightJoystickActive}
              />
            </View>
            
            {/* Virtual Stick Controls Panel */}
            <View style={styles.virtualStickControlPanel}>
              {/* Close Virtual Stick Button */}
              <TouchableOpacity 
                style={styles.closeVirtualStickButton}
                onPress={handleDisableVirtualStick}
              >
                <Text style={styles.closeVirtualStickText}>✕ CLOSE</Text>
              </TouchableOpacity>
              
              {/* Autonomous Flight Controls */}
              {isFlying && (
                <View style={styles.autonomousFlightPanel}>
                  {!autonomousFlightActive ? (
                    <TouchableOpacity 
                      style={[styles.flightActionButton, styles.autonomousStartButton]} 
                      onPress={handleStartAutonomousFlight}
                    >
                      <Text style={styles.flightActionText}>🎯 AUTO</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.autonomousActiveControls}>
                      <TouchableOpacity 
                        style={[styles.flightActionButton, styles.autonomousPauseButton]} 
                        onPress={handlePauseAutonomousFlight}
                      >
                        <Text style={styles.flightActionText}>
                          {autonomousFlightPaused ? '▶️ RESUME' : '⏸️ PAUSE'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.flightActionButton, styles.autonomousStopButton]} 
                        onPress={handleStopAutonomousFlight}
                      >
                        <Text style={styles.flightActionText}>⏹️ STOP</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
              
            </View>
          </>
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
  gpsBadge: {
    backgroundColor: 'rgba(0, 150, 0, 0.9)',
    color: '#fff',
    fontSize: 10,
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
  landingConfirmButton: {
    backgroundColor: 'rgba(255, 165, 0, 0.9)', // Orange warning color
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

  // Autonomous Flight Styles
  autonomousFlightContainer: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 8,
  },
  autonomousStartButton: {
    backgroundColor: 'rgba(0, 200, 0, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    minWidth: 80,
    alignItems: 'center',
  },
  autonomousStopButton: {
    backgroundColor: 'rgba(255, 0, 0, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    minWidth: 80,
    alignItems: 'center',
  },
  targetCoordsContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  targetCoordsText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Virtual Stick Controls - Absolutely Positioned
  leftJoystickContainer: {
    position: 'absolute',
    bottom: 90,
    left: 60,
    zIndex: 999999,
  },
  rightJoystickContainer: {
    position: 'absolute',
    bottom: 90,
    right: 60,
    zIndex: 999999,
  },
  virtualStickControlPanel: {
    position: 'absolute',
    top: 100,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 15,
    borderRadius: 10,
    zIndex: 999999,
    minWidth: 120,
  },
  closeVirtualStickButton: {
    backgroundColor: 'rgba(255, 0, 0, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    marginBottom: 10,
    alignItems: 'center',
  },
  closeVirtualStickText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  autonomousFlightPanel: {
    alignItems: 'center',
  },
  autonomousActiveControls: {
    flexDirection: 'column',
    gap: 8,
    alignItems: 'center',
  },
  autonomousPauseButton: {
    backgroundColor: 'rgba(255, 140, 0, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    minWidth: 80,
    alignItems: 'center',
  },
  statusRefreshButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
  },
  
  // Waypoint Mission Styles - Always Visible
  waypointMissionPanel: {
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(100, 50, 200, 0.3)',
  },
  waypointTestButton: {
    backgroundColor: 'rgba(100, 50, 200, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  waypointControls: {
    marginTop: 8,
    alignItems: 'center',
    gap: 6,
  },
  waypointFileControls: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  waypointGenerateButton: {
    backgroundColor: 'rgba(255, 165, 0, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  waypointStartButton: {
    backgroundColor: 'rgba(0, 150, 200, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  waypointActiveControls: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  waypointPauseButton: {
    backgroundColor: 'rgba(255, 140, 0, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    minWidth: 80,
    alignItems: 'center',
  },
  waypointStopButton: {
    backgroundColor: 'rgba(255, 0, 0, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    minWidth: 80,
    alignItems: 'center',
  },

  // Center Elevation Display
  centerElevationDisplay: {
    position: 'absolute',
    top: '45%',
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

  // Center GPS Display - Positioned under the altitude display
  centerGPSDisplay: {
    position: 'absolute',
    top: '60%',
    left: '50%',
    transform: [{ translateX: -50 }, { translateY: -50 }],
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0, 150, 255, 0.8)',
    minWidth: 280,
  },
  centerGPSText: {
    color: '#0096ff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  centerGPSLabel: {
    color: '#0096ff',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 1,
    marginTop: 2,
  },
  centerGPSAltText: {
    color: '#0096ff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 4,
  },
});