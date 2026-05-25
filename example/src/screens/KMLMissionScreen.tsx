import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Clipboard,
  Switch,
  TextInput,
  Modal
} from 'react-native';
import { useEvent } from 'expo';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import ExpoDjiSdk, { KMLMissionPreview, DebugLogEvent, importAndExecuteKMLFromContent, pauseKMLMission, resumeKMLMission, stopKMLMission, setCameraMode, startPhotoSession, stopPhotoSession } from 'expo-dji-sdk';
import { BUNDLED_MISSION_KML, BUNDLED_MISSION_NAME } from '../missions/bundledMission';

// Passphrase the operator must type to launch the bundled mission. Guards against
// accidentally starting a real flight when nowhere near the mission site.
const RUN_CONFIRM_PASSPHRASE = 'dafi';

const KMLMissionScreen: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [missionPreview, setMissionPreview] = useState<KMLMissionPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [kmzPath, setKmzPath] = useState<string | null>(null);
  const [isConverted, setIsConverted] = useState(false);
  const [isUploaded, setIsUploaded] = useState(false);
  const [showDebugLogs, setShowDebugLogs] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [missionStatus, setMissionStatus] = useState<'none' | 'running' | 'paused'>('none');
  const [missionProgress, setMissionProgress] = useState<{ currentWaypoint: number; totalWaypoints: number; progress: number } | null>(null);

  // Auto photo-capture during the mission. When the mission starts we switch the
  // camera to PHOTO mode and kick off a native timer that fires the shutter every
  // `captureIntervalMs`. Photos land on the drone SD card; pull them to the phone
  // afterwards from the Gallery screen. NOT a screen grab — this is the real DJI
  // shutter at full sensor resolution.
  const [autoCapture, setAutoCapture] = useState(true);
  const [captureIntervalMs, setCaptureIntervalMs] = useState('2000');
  const [captureSessionId, setCaptureSessionId] = useState<string | null>(null);
  const [captureShotCount, setCaptureShotCount] = useState(0);

  // Bundled-mission quick start + passphrase confirmation gate
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const addDebugLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log(logEntry);
    setDebugLogs(prev => [...prev.slice(-49), logEntry]); // Keep last 50 logs
  };

  const clearDebugLogs = async () => {
    try {
      setDebugLogs([]);
      await ExpoDjiSdk.clearDebugLogs();
      addDebugLog('Debug logs cleared');
    } catch (error) {
      addDebugLog('Failed to clear debug logs: ' + (error as Error).message);
    }
  };

  const copyDebugLogsToClipboard = async () => {
    try {
      const logsText = debugLogs.join('\n');
      const timestamp = new Date().toLocaleString();
      const fullText = `=== Debug Logs Export ===\nExported: ${timestamp}\nTotal Logs: ${debugLogs.length}\n\n${logsText}\n\n=== End Debug Logs ===`;
      
      Clipboard.setString(fullText);
      
      Alert.alert(
        'Logs Copied!',
        `${debugLogs.length} log entries have been copied to clipboard.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert(
        'Copy Failed',
        'Failed to copy logs to clipboard: ' + (error as Error).message,
        [{ text: 'OK' }]
      );
    }
  };

  const selectKMLFile = async () => {
    try {
      addDebugLog('Starting KML file selection');
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.google-earth.kml+xml', '*/*'],
        copyToCacheDirectory: true, // Enable copying to cache
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setFileName(asset.name);
        
        addDebugLog(`Selected file: ${asset.name}`);
        addDebugLog(`File URI: ${asset.uri}`);
        addDebugLog(`File size: ${asset.size} bytes`);
        
        let fileContent: string;
        
        if (asset.uri.startsWith('file://')) {
          // If it's already a file URI (copied to cache), read directly
          addDebugLog('Reading from file URI...');
          fileContent = await FileSystem.readAsStringAsync(asset.uri);
        } else {
          // If it's still a content URI, copy it first then read
          addDebugLog('Converting content URI to file...');
          const fileName = asset.name || `kml_${Date.now()}.kml`;
          const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
          
          // Copy the file to cache directory
          await FileSystem.copyAsync({
            from: asset.uri,
            to: fileUri
          });
          
          addDebugLog(`File copied to: ${fileUri}`);
          
          // Now read the copied file
          fileContent = await FileSystem.readAsStringAsync(fileUri);
        }
        
        addDebugLog(`File content length: ${fileContent.length} characters`);
        addDebugLog(`First 200 chars: ${fileContent.substring(0, 200)}`);
        
        // Store the content for later use
        setSelectedFile(fileContent);
        setIsConverted(false);
        setIsUploaded(false);
        setKmzPath(null);
        
        // Preview the mission using the content
        previewMissionFromContent(fileContent);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addDebugLog(`ERROR selecting file: ${errorMessage}`);
      console.error('Error selecting file:', error);
      Alert.alert('Error', `Failed to select KML file: ${errorMessage}`);
    }
  };

  const previewMissionFromContent = async (kmlContent: string) => {
    setIsLoading(true);
    try {
      addDebugLog('Starting mission preview');
      const preview = await ExpoDjiSdk.previewKMLMissionFromContent(kmlContent);
      setMissionPreview(preview);
      
      addDebugLog(`Preview result: ${preview.optimizedWaypoints} waypoints, valid: ${preview.isValid}`);
      
      if (!preview.isValid) {
        addDebugLog(`Preview issues: ${preview.issues.join(', ')}`);
        Alert.alert(
          'Mission Issues Found',
          `The mission has the following issues:\n\n${preview.issues.join('\n')}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addDebugLog(`ERROR previewing mission: ${errorMessage}`);
      console.error('Error previewing mission:', error);
      Alert.alert('Error', 'Failed to preview KML mission');
      setMissionPreview(null);
    } finally {
      setIsLoading(false);
    }
  };

  const convertToKMZ = async () => {
    if (!selectedFile) {
      Alert.alert('Error', 'Please select a KML file first');
      return;
    }

    setIsLoading(true);
    addDebugLog('=== Starting KML to KMZ Conversion ===');
    addDebugLog(`KML content length: ${selectedFile.length} characters`);
    addDebugLog(`KML content preview: ${selectedFile.substring(0, 200)}...`);
    try {
      addDebugLog('Calling ExpoDjiSdk.convertKMLContentToKMZ');
      const result = await ExpoDjiSdk.convertKMLContentToKMZ(selectedFile);

      addDebugLog(`Conversion result: ${JSON.stringify(result)}`);
      
      addDebugLog(`Conversion result: success=${result.success}, kmzPath=${result.kmzPath}`);
      
      if (result.success && result.kmzPath) {
        setKmzPath(result.kmzPath);
        setIsConverted(true);
        addDebugLog(`✅ Conversion successful: ${result.kmzPath}`);
        Alert.alert(
          'Conversion Successful',
          `KML has been converted to KMZ format.\nFile saved at: ${result.kmzPath}`,
          [{ text: 'OK' }]
        );
      } else {
        throw new Error(result.error || 'Failed to convert KML to KMZ');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addDebugLog(`❌ ERROR converting to KMZ: ${errorMessage}`);
      console.error('Error converting to KMZ:', error);
      Alert.alert('Error', `Failed to convert to KMZ: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const uploadToAircraft = async () => {
    if (!kmzPath) {
      Alert.alert('Error', 'Please convert to KMZ first');
      return;
    }

    Alert.alert(
      'Upload to Aircraft',
      'This will upload the waypoint mission to the connected drone. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upload',
          onPress: async () => {
            setIsLoading(true);
            try {
              const result = await ExpoDjiSdk.uploadKMZToAircraft(kmzPath);
              
              if (result.success) {
                setIsUploaded(true);
                Alert.alert(
                  'Upload Successful',
                  'The waypoint mission has been successfully uploaded to the aircraft.',
                  [{ text: 'OK' }]
                );
              } else {
                throw new Error(result.error || 'Failed to upload KMZ to aircraft');
              }
            } catch (error: unknown) {
              console.error('Error uploading to aircraft:', error);
              
              // Enhanced error handling with technical details
              let userMessage = 'Unknown error occurred';
              let technicalDetails = '';
              
              if (error instanceof Error) {
                userMessage = error.message;
                
                // Check if we have additional error data from native side
                if ('technicalDetails' in error) {
                  const details = (error as any).technicalDetails;
                  if (details) {
                    technicalDetails = `\n\nTechnical Details:\n` +
                      `Code: ${details.errorCode || 'Unknown'}\n` +
                      `Description: ${details.errorDescription || 'N/A'}\n` +
                      `File: ${details.filePath || 'N/A'}`;
                  }
                }
              }
              
              // Show detailed error alert for debugging
              Alert.alert(
                'Upload Failed', 
                `${userMessage}${technicalDetails}`,
                [
                  { text: 'Copy Error', onPress: () => {
                    // Copy error details to clipboard for debugging
                    const fullError = `Upload Error: ${userMessage}${technicalDetails}\n\nFull Error Object: ${JSON.stringify(error, null, 2)}`;
                    console.log('Full error details:', fullError);
                  }},
                  { text: 'OK' }
                ]
              );
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  const formatDistance = (distance: number): string => {
    return distance > 1000 
      ? `${(distance / 1000).toFixed(2)} km`
      : `${distance.toFixed(0)} m`;
  };

  // Begin auto-capture tied to this mission run. sessionId is mission-scoped so
  // the Gallery groups all photos from one flight together, and so the backend
  // upload later knows which mission each photo belongs to.
  const beginCaptureSession = async () => {
    if (!autoCapture) return;
    const ms = Math.max(1500, parseInt(captureIntervalMs, 10) || 2000);
    const sessionId = `mission-${Date.now()}`;
    try {
      await setCameraMode('PHOTO');
      await startPhotoSession(sessionId, ms);
      setCaptureSessionId(sessionId);
      setCaptureShotCount(0);
      addDebugLog(`📸 Auto-capture started (${ms}ms) → session ${sessionId}`);
    } catch (e: any) {
      addDebugLog(`⚠️ Auto-capture failed to start: ${e?.message ?? e}`);
      Alert.alert(
        'Capture not started',
        `The mission is running but photo capture could not start: ${e?.message ?? e}\n\n` +
          `Check the drone is connected and the camera is reachable.`,
      );
    }
  };

  const endCaptureSession = async (reason: string) => {
    if (!captureSessionId) return;
    try {
      const res = await stopPhotoSession();
      addDebugLog(`📸 Auto-capture stopped (${reason}) — ${res?.shotCount ?? '?'} shots`);
    } catch (e: any) {
      addDebugLog(`⚠️ Failed to stop capture: ${e?.message ?? e}`);
    } finally {
      setCaptureSessionId(null);
    }
  };

  // Launch the bundled mission directly (no file pick/upload). Only called after
  // the passphrase gate passes.
  const runBundledMission = async () => {
    setIsLoading(true);
    try {
      addDebugLog(`Starting BUNDLED mission: ${BUNDLED_MISSION_NAME}`);
      const result = await importAndExecuteKMLFromContent(BUNDLED_MISSION_KML, {});
      if (result.success) {
        setMissionStatus('running');
        addDebugLog('✅ Bundled mission started');
        beginCaptureSession();
        Alert.alert(
          'Mission Started',
          autoCapture
            ? `"${BUNDLED_MISSION_NAME}" is running with auto-capture every ${captureIntervalMs}ms. Photos save to the drone SD — pull them from the Gallery after landing.`
            : `"${BUNDLED_MISSION_NAME}" is running.`,
        );
      } else {
        throw new Error(result.error || 'Failed to start bundled mission');
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      addDebugLog(`❌ ERROR starting bundled mission: ${msg}`);
      Alert.alert('Error', `Failed to start mission: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Validate the passphrase, then run. Wrong/empty input is rejected.
  const confirmAndRunBundled = () => {
    if (confirmText.trim().toLowerCase() !== RUN_CONFIRM_PASSPHRASE) {
      Alert.alert('Not confirmed', `Type "${RUN_CONFIRM_PASSPHRASE}" exactly to launch the mission.`);
      return;
    }
    setConfirmVisible(false);
    setConfirmText('');
    runBundledMission();
  };

  const startMission = async () => {
    if (!selectedFile) {
      Alert.alert('Error', 'Please select a KML file first');
      return;
    }

    Alert.alert(
      'Start Mission',
      'This will start the virtual stick mission using the imported KML waypoints. Make sure the drone is ready for takeoff.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Mission',
          onPress: async () => {
            setIsLoading(true);
            try {
              addDebugLog('Starting KML mission execution');
              const result = await importAndExecuteKMLFromContent(selectedFile, {});
              
              if (result.success) {
                setMissionStatus('running');
                addDebugLog('✅ Mission started successfully');
                // Kick off auto photo-capture for this run (fire-and-forget;
                // it surfaces its own alert if the camera isn't reachable).
                beginCaptureSession();
                Alert.alert(
                  'Mission Started',
                  autoCapture
                    ? `The mission is running and auto-capture is on (every ${captureIntervalMs}ms). Photos save to the drone SD card — pull them to the phone from the Gallery after landing.`
                    : 'The virtual stick mission has been started. You can pause it at any time to regain manual control.',
                  [{ text: 'OK' }]
                );
              } else {
                throw new Error(result.error || 'Failed to start mission');
              }
            } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              addDebugLog(`❌ ERROR starting mission: ${errorMessage}`);
              console.error('Error starting mission:', error);
              Alert.alert('Error', `Failed to start mission: ${errorMessage}`);
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  const pauseMission = async () => {
    setIsLoading(true);
    try {
      addDebugLog('Pausing mission and disabling virtual stick');
      const result = await pauseKMLMission();
      
      if (result.success) {
        setMissionStatus('paused');
        addDebugLog('✅ Mission paused - virtual stick disabled, RC control available');
        Alert.alert(
          'Mission Paused',
          'Mission has been paused and virtual stick mode is disabled. You now have manual RC control.',
          [{ text: 'OK' }]
        );
      } else {
        throw new Error(result.message || 'Failed to pause mission');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addDebugLog(`❌ ERROR pausing mission: ${errorMessage}`);
      console.error('Error pausing mission:', error);
      Alert.alert('Error', `Failed to pause mission: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const resumeMission = async () => {
    setIsLoading(true);
    try {
      addDebugLog('Resuming mission and re-enabling virtual stick');
      const result = await resumeKMLMission();
      
      if (result.success) {
        setMissionStatus('running');
        addDebugLog('✅ Mission resumed - virtual stick re-enabled');
        Alert.alert(
          'Mission Resumed',
          'Mission has been resumed. Virtual stick control is now active.',
          [{ text: 'OK' }]
        );
      } else {
        throw new Error(result.message || 'Failed to resume mission');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addDebugLog(`❌ ERROR resuming mission: ${errorMessage}`);
      console.error('Error resuming mission:', error);
      Alert.alert('Error', `Failed to resume mission: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const stopMission = async () => {
    Alert.alert(
      'Stop Mission',
      'This will stop the current mission and disable virtual stick mode. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop Mission',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              addDebugLog('Stopping mission');
              await endCaptureSession('mission stopped');
              const result = await stopKMLMission();

              if (result.success) {
                setMissionStatus('none');
                setMissionProgress(null);
                addDebugLog('✅ Mission stopped - virtual stick disabled');
                Alert.alert(
                  'Mission Stopped',
                  'Mission has been stopped and virtual stick mode is disabled.',
                  [{ text: 'OK' }]
                );
              } else {
                throw new Error(result.message || 'Failed to stop mission');
              }
            } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              addDebugLog(`❌ ERROR stopping mission: ${errorMessage}`);
              console.error('Error stopping mission:', error);
              Alert.alert('Error', `Failed to stop mission: ${errorMessage}`);
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  // Setup real-time debug logging
  useEffect(() => {
    let subscription: any;
    let missionSubscription: any;

    const setupDebugLogging = async () => {
      try {
        // Enable debug logging in native module
        await ExpoDjiSdk.enableDebugLogging(true);
        addDebugLog('Debug logging enabled');

        // Subscribe to real-time debug log events
        subscription = ExpoDjiSdk.addListener('onDebugLog', (event: DebugLogEvent) => {
          const formattedLog = `[${new Date(event.timestamp).toLocaleTimeString()}] ${event.level}: ${event.message}`;
          setDebugLogs(prev => [...prev.slice(-99), formattedLog]); // Keep last 100 logs
        });

        // Subscribe to KML mission events
        missionSubscription = ExpoDjiSdk.addListener('onKMLMissionEvent', (event: any) => {
          addDebugLog(`Mission Event: ${event.type}`);
          
          switch (event.type) {
            case 'missionStarted':
              setMissionStatus('running');
              addDebugLog('✅ Mission started via event');
              break;
            case 'missionProgress':
              if (event.data) {
                setMissionProgress(event.data);
                addDebugLog(`Mission progress: ${Math.round(event.data.progress * 100)}%`);
              }
              break;
            case 'missionCompleted':
              setMissionStatus('none');
              setMissionProgress(null);
              endCaptureSession('mission completed');
              addDebugLog('✅ Mission completed');
              Alert.alert('Mission Complete', 'The KML mission has been completed successfully! Pull the captured photos from the Gallery after landing.');
              break;
            case 'missionFailed':
              setMissionStatus('none');
              setMissionProgress(null);
              endCaptureSession('mission failed');
              addDebugLog(`❌ Mission failed: ${event.error || 'Unknown error'}`);
              Alert.alert('Mission Failed', `Mission failed: ${event.error || 'Unknown error'}`);
              break;
            case 'missionPaused':
              setMissionStatus('paused');
              addDebugLog('⏸️ Mission paused via event');
              break;
            case 'missionResumed':
              setMissionStatus('running');
              addDebugLog('▶️ Mission resumed via event');
              break;
          }
        });
      } catch (error) {
        console.error('Failed to setup debug logging:', error);
        addDebugLog('Failed to setup debug logging: ' + (error as Error).message);
      }
    };

    // Live shot counter — fires once per shutter trigger during the session.
    const shootSubscription = ExpoDjiSdk.addListener('onShootPhotoResult', (event: any) => {
      if (event?.success) setCaptureShotCount(event.shotIndex);
    });

    setupDebugLogging();

    return () => {
      if (subscription) {
        subscription.remove();
      }
      if (missionSubscription) {
        missionSubscription.remove();
      }
      shootSubscription.remove();
    };
  }, []);


  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 200 }}>
      {/* Quick-start: launch the bundled mission directly, gated by a passphrase. */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚡ Quick Start</Text>
        <Text style={styles.quickStartName}>{BUNDLED_MISSION_NAME}</Text>
        <Text style={styles.quickStartHint}>
          Launches the bundled mission — no file pick/upload. You'll be asked to type a
          passphrase first so it can't start by accident when you're away from the site.
        </Text>
        <TouchableOpacity
          style={[styles.button, styles.quickStartButton]}
          onPress={() => { setConfirmText(''); setConfirmVisible(true); }}
          disabled={isLoading || missionStatus !== 'none'}
        >
          <Text style={styles.buttonText}>
            {missionStatus !== 'none' ? 'Mission in progress…' : '🚀 Quick Start Mission'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Passphrase confirmation modal */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Confirm mission start</Text>
            <Text style={styles.confirmBody}>
              About to launch{'\n'}<Text style={{ fontWeight: '700' }}>{BUNDLED_MISSION_NAME}</Text>.{'\n\n'}
              The drone will take off and fly the route. Only confirm if you are on-site and the
              area is clear. Type <Text style={{ fontWeight: '700' }}>{RUN_CONFIRM_PASSPHRASE}</Text> to proceed.
            </Text>
            <TextInput
              style={styles.confirmInput}
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder={`type "${RUN_CONFIRM_PASSPHRASE}"`}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            <View style={styles.confirmRow}>
              <TouchableOpacity
                style={[styles.button, styles.confirmCancel, { flex: 1, marginRight: 8 }]}
                onPress={() => { setConfirmVisible(false); setConfirmText(''); }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.confirmRun,
                  { flex: 1 },
                  confirmText.trim().toLowerCase() !== RUN_CONFIRM_PASSPHRASE && { opacity: 0.4 },
                ]}
                onPress={confirmAndRunBundled}
                disabled={confirmText.trim().toLowerCase() !== RUN_CONFIRM_PASSPHRASE}
              >
                <Text style={styles.buttonText}>Run mission</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>KML to KMZ Converter</Text>

        {/* File Selection */}
        <TouchableOpacity
          style={styles.button}
          onPress={selectKMLFile}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {fileName ? `Selected: ${fileName}` : 'Select KML File'}
          </Text>
        </TouchableOpacity>

        {/* Loading indicator */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Processing...</Text>
          </View>
        )}

        {/* Mission Preview */}
        {missionPreview && (
          <View style={styles.previewContainer}>
            <Text style={styles.previewTitle}>Mission Preview</Text>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Name:</Text>
              <Text style={styles.previewValue}>{missionPreview.name}</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Waypoints:</Text>
              <Text style={styles.previewValue}>
                {missionPreview.optimizedWaypoints} (optimized from {missionPreview.originalWaypoints})
              </Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Distance:</Text>
              <Text style={styles.previewValue}>{formatDistance(missionPreview.totalDistance)}</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Altitude:</Text>
              <Text style={styles.previewValue}>
                {missionPreview.minAltitude.toFixed(0)}m - {missionPreview.maxAltitude.toFixed(0)}m
              </Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Valid:</Text>
              <Text style={[
                styles.previewValue, 
                { color: missionPreview.isValid ? '#28a745' : '#dc3545' }
              ]}>
                {missionPreview.isValid ? 'Yes' : 'No'}
              </Text>
            </View>
            
            {!missionPreview.isValid && (
              <View style={styles.issuesContainer}>
                <Text style={styles.issuesTitle}>Issues:</Text>
                {missionPreview.issues.map((issue: string, index: number) => (
                  <Text key={index} style={styles.issueText}>• {issue}</Text>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Conversion and Upload Controls */}
        {missionPreview && missionPreview.isValid && (
          <View style={styles.controlsContainer}>
            <TouchableOpacity 
              style={[
                styles.button, 
                styles.convertButton,
                isConverted && styles.successButton
              ]} 
              onPress={convertToKMZ}
              disabled={isLoading || isConverted}
            >
              <Text style={styles.buttonText}>
                {isConverted ? '✓ Converted to KMZ' : 'Convert to KMZ'}
              </Text>
            </TouchableOpacity>

            {isConverted && kmzPath && (
              <View style={styles.kmzPathContainer}>
                <Text style={styles.kmzPathLabel}>KMZ File:</Text>
                <Text style={styles.kmzPathValue} numberOfLines={2}>
                  {kmzPath}
                </Text>
              </View>
            )}

            {isConverted && (
              <TouchableOpacity 
                style={[
                  styles.button, 
                  styles.uploadButton,
                  isUploaded && styles.successButton
                ]} 
                onPress={uploadToAircraft}
                disabled={isLoading || isUploaded}
              >
                <Text style={styles.buttonText}>
                  {isUploaded ? '✓ Uploaded to Aircraft' : 'Upload to Aircraft'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Mission Execution Controls */}
        {missionPreview && missionPreview.isValid && (
          <View style={styles.missionControlContainer}>
            <Text style={styles.missionControlTitle}>Mission Execution</Text>
            
            {missionStatus === 'none' && (
              <>
                {/* Auto photo-capture config */}
                <View style={styles.captureConfig}>
                  <View style={styles.captureRow}>
                    <Text style={styles.captureLabel}>📸 Auto-capture during mission</Text>
                    <Switch value={autoCapture} onValueChange={setAutoCapture} />
                  </View>
                  {autoCapture && (
                    <View style={styles.captureRow}>
                      <Text style={styles.captureLabel}>Interval (ms)</Text>
                      <TextInput
                        style={styles.captureInput}
                        value={captureIntervalMs}
                        onChangeText={setCaptureIntervalMs}
                        keyboardType="number-pad"
                      />
                    </View>
                  )}
                  {autoCapture && (
                    <Text style={styles.captureHint}>
                      Min 1500ms (Mini 3 shutter limit). Real drone photos → drone SD card →
                      pull to phone from Gallery after landing.
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={[styles.button, styles.startButton]}
                  onPress={startMission}
                  disabled={isLoading}
                >
                  <Text style={styles.buttonText}>🚁 Start Mission</Text>
                </TouchableOpacity>
              </>
            )}

            {missionStatus === 'running' && (
              <>
                {captureSessionId && (
                  <View style={styles.captureLive}>
                    <Text style={styles.captureLiveCount}>{captureShotCount}</Text>
                    <Text style={styles.captureLiveLabel}>photos captured to drone SD</Text>
                  </View>
                )}
                <View style={styles.missionControlsRow}>
                  <TouchableOpacity
                    style={[styles.button, styles.pauseButton, { flex: 1, marginRight: 8 }]}
                    onPress={pauseMission}
                    disabled={isLoading}
                  >
                    <Text style={styles.buttonText}>⏸️ Pause</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.button, styles.stopButton, { flex: 1 }]}
                    onPress={stopMission}
                    disabled={isLoading}
                  >
                    <Text style={styles.buttonText}>⏹️ Stop</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {missionStatus === 'paused' && (
              <View style={styles.missionControlsRow}>
                <TouchableOpacity 
                  style={[styles.button, styles.resumeButton, { flex: 1, marginRight: 8 }]}
                  onPress={resumeMission}
                  disabled={isLoading}
                >
                  <Text style={styles.buttonText}>▶️ Resume</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.button, styles.stopButton, { flex: 1 }]}
                  onPress={stopMission}
                  disabled={isLoading}
                >
                  <Text style={styles.buttonText}>⏹️ Stop</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Mission Status Display */}
            <View style={styles.missionStatusContainer}>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Mission Status:</Text>
                <Text style={[
                  styles.statusValue,
                  { color: missionStatus === 'running' ? '#28a745' : missionStatus === 'paused' ? '#ffc107' : '#6c757d' }
                ]}>
                  {missionStatus === 'running' ? '🟢 Running' : 
                   missionStatus === 'paused' ? '🟡 Paused' : '⚫ Stopped'}
                </Text>
              </View>
              
              {missionProgress && (
                <>
                  <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Progress:</Text>
                    <Text style={styles.statusValue}>
                      {missionProgress.distanceToTarget === -1 ? (
                        `Waiting for GPS lock... (${Math.round(missionProgress.progress * 100)}%)`
                      ) : (
                        `${missionProgress.currentWaypoint}/${missionProgress.totalWaypoints} waypoints (${Math.round(missionProgress.progress * 100)}%)`
                      )}
                    </Text>
                  </View>
                  
                  {missionProgress.distanceToTarget !== -1 && (
                    <View style={styles.statusRow}>
                      <Text style={styles.statusLabel}>Distance to target:</Text>
                      <Text style={styles.statusValue}>
                        {missionProgress.distanceToTarget > 1000 
                          ? `${(missionProgress.distanceToTarget / 1000).toFixed(2)} km`
                          : `${missionProgress.distanceToTarget.toFixed(0)} m`}
                      </Text>
                    </View>
                  )}
                  
                  <View style={styles.progressBarContainer}>
                    <View style={[
                      styles.progressBar, 
                      { 
                        width: `${missionProgress.progress * 100}%`,
                        backgroundColor: missionProgress.distanceToTarget === -1 ? '#ffc107' : '#28a745'
                      }
                    ]} />
                  </View>
                  
                  {missionProgress.distanceToTarget === -1 && (
                    <View style={styles.gpsWaitNotice}>
                      <Text style={styles.gpsWaitText}>
                        🛰️ Waiting for GPS lock. The drone will hover until GPS coordinates are available.
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>

            {missionStatus === 'paused' && (
              <View style={styles.rcControlNotice}>
                <Text style={styles.rcControlText}>
                  🎮 Virtual stick is disabled. You have manual RC control.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Status Summary */}
        {(isConverted || isUploaded) && (
          <View style={styles.statusContainer}>
            <Text style={styles.statusTitle}>Status</Text>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>KML Selected:</Text>
              <Text style={styles.statusValue}>✓</Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Converted to KMZ:</Text>
              <Text style={styles.statusValue}>{isConverted ? '✓' : '○'}</Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Uploaded to Aircraft:</Text>
              <Text style={styles.statusValue}>{isUploaded ? '✓' : '○'}</Text>
            </View>
          </View>
        )}

        {/* Debug Logs Section */}
        <View style={styles.debugContainer}>
          <TouchableOpacity 
            style={styles.debugToggle} 
            onPress={() => setShowDebugLogs(!showDebugLogs)}
          >
            <Text style={styles.debugToggleText}>
              {showDebugLogs ? '🔽' : '▶️'} Debug Logs ({debugLogs.length})
            </Text>
          </TouchableOpacity>

          {showDebugLogs && (
            <View style={styles.debugLogsContainer}>
              <View style={styles.debugHeader}>
                <Text style={styles.debugTitle}>Debug Logs</Text>
                <View style={styles.debugActions}>
                  <TouchableOpacity 
                    style={[styles.clearLogsButton, styles.copyButton]} 
                    onPress={copyDebugLogsToClipboard}
                    disabled={debugLogs.length === 0}
                  >
                    <Text style={[styles.clearLogsText, debugLogs.length === 0 && styles.disabledText]}>
                      📋 Copy
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.clearLogsButton} onPress={clearDebugLogs}>
                    <Text style={styles.clearLogsText}>🗑️ Clear</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              <ScrollView style={styles.debugScrollView} contentContainerStyle={{paddingBottom:200}} nestedScrollEnabled={true}>
                {debugLogs.length === 0 ? (
                  <Text style={styles.noLogsText}>No logs yet. Select a KML file to start.</Text>
                ) : (
                  debugLogs.map((log, index) => (
                    <Text key={index} style={styles.debugLogText}>
                      {log}
                    </Text>
                  ))
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  section: {
    margin: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  convertButton: {
    backgroundColor: '#17a2b8',
  },
  uploadButton: {
    backgroundColor: '#28a745',
    marginTop: 8,
  },
  successButton: {
    backgroundColor: '#6c757d',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 8,
    color: '#666',
  },
  previewContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  previewRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  previewLabel: {
    flex: 1,
    fontWeight: '600',
    color: '#666',
  },
  previewValue: {
    flex: 2,
    color: '#333',
  },
  issuesContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#fff3cd',
    borderRadius: 4,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  issuesTitle: {
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 8,
  },
  issueText: {
    color: '#856404',
    marginBottom: 4,
  },
  controlsContainer: {
    marginBottom: 16,
  },
  kmzPathContainer: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 4,
    marginTop: 8,
  },
  kmzPathLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  kmzPathValue: {
    fontSize: 12,
    color: '#333',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  statusContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  statusRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  statusLabel: {
    flex: 2,
    fontWeight: '600',
    color: '#666',
  },
  statusValue: {
    flex: 1,
    color: '#28a745',
    fontSize: 18,
    textAlign: 'center',
  },
  debugContainer: {
    marginTop: 16,
    backgroundColor: 'white',
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  debugToggle: {
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  debugToggleText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  debugLogsContainer: {
    maxHeight: 300,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  debugHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#e9ecef',
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#495057',
  },
  debugActions: {
    flexDirection: 'row',
    gap: 8,
  },
  clearLogsButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#dc3545',
    borderRadius: 4,
  },
  copyButton: {
    backgroundColor: '#007bff',
  },
  clearLogsText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  disabledText: {
    opacity: 0.5,
  },
  debugScrollView: {
    maxHeight: 250,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  noLogsText: {
    textAlign: 'center',
    color: '#6c757d',
    fontStyle: 'italic',
    padding: 20,
  },
  debugLogText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#212529',
    marginBottom: 4,
    lineHeight: 16,
  },
  missionControlContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  missionControlTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  captureConfig: {
    backgroundColor: '#F2F8FC',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#D6E8F4',
  },
  captureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  captureLabel: { fontSize: 14, color: '#333', flex: 1 },
  captureInput: {
    borderWidth: 1,
    borderColor: '#C5D8E6',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 90,
    textAlign: 'right',
    backgroundColor: 'white',
    color: '#333',
  },
  captureHint: { fontSize: 11, color: '#6c757d', lineHeight: 15, marginTop: 2 },
  captureLive: {
    alignItems: 'center',
    backgroundColor: '#0F1729',
    borderRadius: 8,
    paddingVertical: 16,
    marginBottom: 12,
  },
  captureLiveCount: { color: '#40DEAC', fontSize: 40, fontWeight: '700' },
  captureLiveLabel: { color: '#7F8B9E', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  quickStartName: { fontSize: 15, fontWeight: '700', color: '#0F1729', marginBottom: 4 },
  quickStartHint: { fontSize: 12, color: '#6c757d', lineHeight: 17, marginBottom: 12 },
  quickStartButton: { backgroundColor: '#7B61FF' },
  confirmBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  confirmCard: { backgroundColor: 'white', borderRadius: 12, padding: 20, width: '100%' },
  confirmTitle: { fontSize: 17, fontWeight: '700', color: '#0F1729', marginBottom: 10 },
  confirmBody: { fontSize: 13, color: '#333', lineHeight: 19, marginBottom: 14 },
  confirmInput: {
    borderWidth: 1, borderColor: '#C5D8E6', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#0F1729',
    marginBottom: 14, backgroundColor: '#F8FAFC',
  },
  confirmRow: { flexDirection: 'row' },
  confirmCancel: { backgroundColor: '#6c757d' },
  confirmRun: { backgroundColor: '#FF6B6B' },
  missionControlsRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  startButton: {
    backgroundColor: '#28a745',
  },
  pauseButton: {
    backgroundColor: '#ffc107',
  },
  resumeButton: {
    backgroundColor: '#17a2b8',
  },
  stopButton: {
    backgroundColor: '#dc3545',
  },
  missionStatusContainer: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 4,
    marginTop: 12,
  },
  progressBarContainer: {
    backgroundColor: '#e9ecef',
    height: 8,
    borderRadius: 4,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#28a745',
    borderRadius: 4,
  },
  rcControlNotice: {
    backgroundColor: '#d4edda',
    padding: 12,
    borderRadius: 4,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#28a745',
  },
  rcControlText: {
    color: '#155724',
    fontWeight: '600',
    textAlign: 'center',
  },
  gpsWaitNotice: {
    backgroundColor: '#fff3cd',
    padding: 12,
    borderRadius: 4,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  gpsWaitText: {
    color: '#856404',
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default KMLMissionScreen;