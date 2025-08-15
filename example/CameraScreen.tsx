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
import * as FileSystem from 'expo-file-system';
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
  // New KML Virtual Stick Mission functions
  importAndExecuteKMLFromContent,
  pauseKMLMission,
  resumeKMLMission,
  stopKMLMission,
  KMLMissionPreview,
  FlightStatus,
  ReadinessCheck,
  AltitudeInfo,
  GPSLocation
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
  
  const [isLandingConfirmationRequired, setIsLandingConfirmationRequired] = useState(false);
  
  // KML Virtual Stick Mission states
  const [selectedKMLFile, setSelectedKMLFile] = useState<string | null>(null);
  const [kmlFileName, setKmlFileName] = useState<string>('');
  const [missionPreview, setMissionPreview] = useState<KMLMissionPreview | null>(null);
  const [kmlMissionStatus, setKmlMissionStatus] = useState<'none' | 'running' | 'paused'>('none');
  const [kmlMissionProgress, setKmlMissionProgress] = useState<{ currentWaypoint: number; totalWaypoints: number; progress: number; distanceToTarget?: number } | null>(null);
  const [showMissionDebugLogs, setShowMissionDebugLogs] = useState(false);
  const [missionDebugLogs, setMissionDebugLogs] = useState<string[]>([]);

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
  
  // Listen to KML mission events
  const onDebugLog = useEvent(ExpoDjiSdk, 'onDebugLog');
  const onKMLMissionEvent = useEvent(ExpoDjiSdk, 'onKMLMissionEvent');

  const addDebugLog = (message: string) => {
    console.log(`[CameraScreen] ${message}`);
    setDebugInfo(prev => `${new Date().toLocaleTimeString()}: ${message}\n${prev}`.slice(0, 3000));
  };

  const addMissionDebugLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log(logEntry);
    setMissionDebugLogs(prev => [...prev.slice(-49), logEntry]); // Keep last 50 logs
  };

  const clearMissionDebugLogs = async () => {
    try {
      setMissionDebugLogs([]);
      await ExpoDjiSdk.clearDebugLogs();
      addMissionDebugLog('Mission debug logs cleared');
    } catch (error) {
      addMissionDebugLog('Failed to clear debug logs: ' + (error as Error).message);
    }
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

  // Handle KML mission debug logs
  useEffect(() => {
    if (onDebugLog) {
      const formattedLog = `[${new Date(onDebugLog.timestamp).toLocaleTimeString()}] ${onDebugLog.level}: ${onDebugLog.message}`;
      setMissionDebugLogs(prev => [...prev.slice(-99), formattedLog]); // Keep last 100 logs
    }
  }, [onDebugLog]);

  // Handle KML mission events
  useEffect(() => {
    if (onKMLMissionEvent) {
      addMissionDebugLog(`Mission Event: ${onKMLMissionEvent.type}`);
      
      switch (onKMLMissionEvent.type) {
        case 'missionStarted':
          setKmlMissionStatus('running');
          addMissionDebugLog('✅ KML Mission started');
          Alert.alert('Mission Started', 'KML virtual stick mission has been started!');
          break;
        case 'missionProgress':
          if (onKMLMissionEvent.data && 'progress' in onKMLMissionEvent.data) {
            setKmlMissionProgress(onKMLMissionEvent.data);
            addMissionDebugLog(`Progress: ${Math.round(onKMLMissionEvent.data.progress * 100)}%`);
          }
          break;
        case 'missionCompleted':
          setKmlMissionStatus('none');
          setKmlMissionProgress(null);
          addMissionDebugLog('✅ KML Mission completed successfully');
          Alert.alert('Mission Complete', 'The KML mission has been completed successfully!');
          break;
        case 'missionFailed':
          setKmlMissionStatus('none');
          setKmlMissionProgress(null);
          addMissionDebugLog(`❌ Mission failed: ${onKMLMissionEvent.error || 'Unknown error'}`);
          Alert.alert('Mission Failed', `Mission failed: ${onKMLMissionEvent.error || 'Unknown error'}`);
          break;
        case 'missionPaused':
          setKmlMissionStatus('paused');
          addMissionDebugLog('⏸️ Mission paused');
          break;
        case 'missionResumed':
          setKmlMissionStatus('running');
          addMissionDebugLog('▶️ Mission resumed');
          break;
      }
    }
  }, [onKMLMissionEvent]);

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
          
          // Setup KML mission debug logging
          try {
            await ExpoDjiSdk.enableDebugLogging(true);
            addMissionDebugLog('KML Mission debug logging enabled');
          } catch (debugError) {
            addMissionDebugLog('Failed to enable debug logging: ' + (debugError as Error).message);
          }
          
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

  // KML Mission Functions
  const selectKMLFile = async () => {
    try {
      addMissionDebugLog('Opening KML file picker...');
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.google-earth.kml+xml', '*/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setKmlFileName(asset.name);
        
        addMissionDebugLog(`Selected file: ${asset.name}`);
        
        let fileContent: string;
        
        if (asset.uri.startsWith('file://')) {
          fileContent = await FileSystem.readAsStringAsync(asset.uri);
        } else {
          const fileName = asset.name || `kml_${Date.now()}.kml`;
          const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
          
          await FileSystem.copyAsync({
            from: asset.uri,
            to: fileUri
          });
          
          fileContent = await FileSystem.readAsStringAsync(fileUri);
        }
        
        addMissionDebugLog(`File content length: ${fileContent.length} characters`);
        setSelectedKMLFile(fileContent);
        
        // Preview the mission
        try {
          const preview = await ExpoDjiSdk.previewKMLMissionFromContent(fileContent);
          setMissionPreview(preview);
          addMissionDebugLog(`Mission preview: ${preview.optimizedWaypoints} waypoints, valid: ${preview.isValid}`);
          
          if (!preview.isValid) {
            Alert.alert('Mission Issues', `Issues found:\n${preview.issues.join('\n')}`);
          }
        } catch (previewError) {
          addMissionDebugLog(`Preview error: ${(previewError as Error).message}`);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addMissionDebugLog(`ERROR selecting file: ${errorMessage}`);
      Alert.alert('Error', `Failed to select KML file: ${errorMessage}`);
    }
  };

  const startKMLMission = async () => {
    if (!selectedKMLFile) {
      Alert.alert('Error', 'Please select a KML file first');
      return;
    }

    Alert.alert(
      'Start KML Mission',
      'This will start the virtual stick mission using advanced mode. The drone will automatically takeoff if needed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Mission',
          onPress: async () => {
            try {
              addMissionDebugLog('Starting KML virtual stick mission...');
              const result = await importAndExecuteKMLFromContent(selectedKMLFile, {});
              
              if (result.success) {
                setKmlMissionStatus('running');
                addMissionDebugLog('✅ Mission started successfully');
              } else {
                throw new Error(result.error || 'Failed to start mission');
              }
            } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              addMissionDebugLog(`❌ ERROR starting mission: ${errorMessage}`);
              Alert.alert('Error', `Failed to start mission: ${errorMessage}`);
            }
          }
        }
      ]
    );
  };

  const pauseKMLMissionHandler = async () => {
    try {
      addMissionDebugLog('Pausing KML mission...');
      const result = await pauseKMLMission();
      
      if (result.success) {
        setKmlMissionStatus('paused');
        addMissionDebugLog('✅ Mission paused - virtual stick disabled');
      } else {
        throw new Error(result.message || 'Failed to pause mission');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addMissionDebugLog(`❌ ERROR pausing mission: ${errorMessage}`);
      Alert.alert('Error', `Failed to pause mission: ${errorMessage}`);
    }
  };

  const resumeKMLMissionHandler = async () => {
    try {
      addMissionDebugLog('Resuming KML mission...');
      const result = await resumeKMLMission();
      
      if (result.success) {
        setKmlMissionStatus('running');
        addMissionDebugLog('✅ Mission resumed - virtual stick re-enabled');
      } else {
        throw new Error(result.message || 'Failed to resume mission');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addMissionDebugLog(`❌ ERROR resuming mission: ${errorMessage}`);
      Alert.alert('Error', `Failed to resume mission: ${errorMessage}`);
    }
  };

  const stopKMLMissionHandler = async () => {
    Alert.alert(
      'Stop Mission',
      'This will stop the current mission. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop Mission',
          style: 'destructive',
          onPress: async () => {
            try {
              addMissionDebugLog('Stopping KML mission...');
              const result = await stopKMLMission();
              
              if (result.success) {
                setKmlMissionStatus('none');
                setKmlMissionProgress(null);
                addMissionDebugLog('✅ Mission stopped');
              } else {
                throw new Error(result.message || 'Failed to stop mission');
              }
            } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              addMissionDebugLog(`❌ ERROR stopping mission: ${errorMessage}`);
              Alert.alert('Error', `Failed to stop mission: ${errorMessage}`);
            }
          }
        }
      ]
    );
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
            
            {/* KML Virtual Stick Mission Controls */}
            <View style={styles.kmlMissionPanel}>
              <TouchableOpacity 
                style={[styles.flightActionButton, styles.kmlSelectButton]} 
                onPress={selectKMLFile}
              >
                <Text style={styles.flightActionText}>📂 SELECT KML</Text>
              </TouchableOpacity>
              
              {selectedKMLFile && missionPreview && (
                <View style={styles.kmlMissionInfo}>
                  <Text style={styles.kmlMissionText}>
                    📁 {kmlFileName} ({missionPreview.optimizedWaypoints} waypoints)
                  </Text>
                  
                  {kmlMissionStatus === 'none' && (
                    <TouchableOpacity 
                      style={[styles.flightActionButton, styles.kmlStartButton]} 
                      onPress={startKMLMission}
                    >
                      <Text style={styles.flightActionText}>🚁 START MISSION</Text>
                    </TouchableOpacity>
                  )}
                  
                  {kmlMissionStatus === 'running' && (
                    <View style={styles.kmlActiveControls}>
                      <TouchableOpacity 
                        style={[styles.flightActionButton, styles.kmlPauseButton]} 
                        onPress={pauseKMLMissionHandler}
                      >
                        <Text style={styles.flightActionText}>⏸️ PAUSE</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.flightActionButton, styles.kmlStopButton]} 
                        onPress={stopKMLMissionHandler}
                      >
                        <Text style={styles.flightActionText}>⏹️ STOP</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  
                  {kmlMissionStatus === 'paused' && (
                    <View style={styles.kmlActiveControls}>
                      <TouchableOpacity 
                        style={[styles.flightActionButton, styles.kmlResumeButton]} 
                        onPress={resumeKMLMissionHandler}
                      >
                        <Text style={styles.flightActionText}>▶️ RESUME</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.flightActionButton, styles.kmlStopButton]} 
                        onPress={stopKMLMissionHandler}
                      >
                        <Text style={styles.flightActionText}>⏹️ STOP</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  
                  {/* Mission Progress Display */}
                  {kmlMissionProgress && (
                    <View style={styles.kmlProgressContainer}>
                      <Text style={styles.kmlProgressText}>
                        {kmlMissionProgress.distanceToTarget === -1 ? (
                          `Waiting for GPS lock... (${Math.round(kmlMissionProgress.progress * 100)}%)`
                        ) : (
                          `Progress: ${kmlMissionProgress.currentWaypoint}/${kmlMissionProgress.totalWaypoints} waypoints (${Math.round(kmlMissionProgress.progress * 100)}%)`
                        )}
                      </Text>
                      
                      {kmlMissionProgress.distanceToTarget !== undefined && kmlMissionProgress.distanceToTarget !== -1 && (
                        <Text style={styles.kmlDistanceText}>
                          Distance to target: {kmlMissionProgress.distanceToTarget > 1000 
                            ? `${(kmlMissionProgress.distanceToTarget / 1000).toFixed(2)} km`
                            : `${kmlMissionProgress.distanceToTarget.toFixed(0)} m`}
                        </Text>
                      )}
                      
                      <View style={styles.kmlProgressBar}>
                        <View style={[
                          styles.kmlProgressFill, 
                          { 
                            width: `${kmlMissionProgress.progress * 100}%`,
                            backgroundColor: kmlMissionProgress.distanceToTarget === -1 ? '#ffc107' : '#28a745'
                          }
                        ]} />
                      </View>
                      
                      {kmlMissionProgress.distanceToTarget === -1 && (
                        <Text style={styles.kmlGpsWaitText}>
                          🛰️ Waiting for GPS lock
                        </Text>
                      )}
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
          <View style={styles.debugTabs}>
            <TouchableOpacity 
              style={[styles.debugTab, !showMissionDebugLogs && styles.debugTabActive]} 
              onPress={() => setShowMissionDebugLogs(false)}
            >
              <Text style={styles.debugTabText}>System Logs</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.debugTab, showMissionDebugLogs && styles.debugTabActive]} 
              onPress={() => setShowMissionDebugLogs(true)}
            >
              <Text style={styles.debugTabText}>Mission Logs ({missionDebugLogs.length})</Text>
            </TouchableOpacity>
          </View>
          
          <Text style={styles.debugTitle}>
            {showMissionDebugLogs ? 'KML Mission Debug Log:' : 'Live Debug Log:'}
          </Text>
          
          <ScrollView style={styles.debugScrollView}>
            <Text style={styles.debugText}>
              {showMissionDebugLogs ? missionDebugLogs.join('\n') : debugInfo}
            </Text>
          </ScrollView>
          
          <View style={styles.debugActions}>
            <TouchableOpacity 
              style={styles.clearButton} 
              onPress={showMissionDebugLogs ? clearMissionDebugLogs : clearDebugLogs}
            >
              <Text style={styles.clearButtonText}>
                Clear {showMissionDebugLogs ? 'Mission' : 'System'} Logs
              </Text>
            </TouchableOpacity>
          </View>
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

  // KML Mission Styles
  kmlMissionPanel: {
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 165, 0, 0.5)',
  },
  kmlSelectButton: {
    backgroundColor: 'rgba(255, 165, 0, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  kmlMissionInfo: {
    marginTop: 8,
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  kmlMissionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  kmlStartButton: {
    backgroundColor: 'rgba(0, 170, 0, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  kmlActiveControls: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  kmlPauseButton: {
    backgroundColor: 'rgba(255, 140, 0, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    minWidth: 80,
    alignItems: 'center',
  },
  kmlResumeButton: {
    backgroundColor: 'rgba(0, 150, 200, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    minWidth: 80,
    alignItems: 'center',
  },
  kmlStopButton: {
    backgroundColor: 'rgba(255, 0, 0, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    minWidth: 80,
    alignItems: 'center',
  },
  kmlProgressContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
    width: '100%',
  },
  kmlProgressText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  kmlDistanceText: {
    color: '#aaa',
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 4,
  },
  kmlProgressBar: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    height: 6,
    borderRadius: 3,
    marginTop: 4,
    overflow: 'hidden',
  },
  kmlProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  kmlGpsWaitText: {
    color: '#ffc107',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },

  // Debug Tabs Styles
  debugTabs: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  debugTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(100, 100, 100, 0.3)',
    borderRadius: 4,
    marginHorizontal: 2,
    alignItems: 'center',
  },
  debugTabActive: {
    backgroundColor: 'rgba(0, 170, 255, 0.6)',
  },
  debugTabText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  debugActions: {
    alignItems: 'flex-end',
    marginTop: 5,
  },
});