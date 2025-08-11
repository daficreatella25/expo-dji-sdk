import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform
} from 'react-native';
import { useEvent } from 'expo';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import ExpoDjiSdk from 'expo-dji-sdk';
import type { 
  KMLMissionPreview, 
  KMLMissionEvent, 
  KMLMissionStatus,
  KMLMissionConfig 
} from 'expo-dji-sdk/src/ExpoDjiSdk.types';

const KMLMissionScreen: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [missionPreview, setMissionPreview] = useState<KMLMissionPreview | null>(null);
  const [missionStatus, setMissionStatus] = useState<KMLMissionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<number>(0);
  const [missionStats, setMissionStats] = useState<any>(null);
  
  // Event listeners
  const onKMLMissionEvent = useEvent(ExpoDjiSdk, 'onKMLMissionEvent');

  useEffect(() => {
    if (onKMLMissionEvent) {
      handleMissionEvent(onKMLMissionEvent);
    }
  }, [onKMLMissionEvent]);

  useEffect(() => {
    // Get initial mission status
    updateMissionStatus();
  }, []);

  const handleMissionEvent = (event: KMLMissionEvent) => {
    console.log('KML Mission Event:', event);
    
    switch (event.type) {
      case 'missionPrepared':
        setMissionStats(event.data);
        Alert.alert('Mission Prepared', 'Mission has been analyzed and is ready to execute.');
        break;
      
      case 'missionStarted':
        Alert.alert('Mission Started', `Mission started using ${event.missionType} mode.`);
        updateMissionStatus();
        break;
      
      case 'missionProgress':
        if (event.data && 'progress' in event.data) {
          setCurrentProgress(event.data.progress);
        }
        break;
      
      case 'missionCompleted':
        Alert.alert('Mission Completed', 'The waypoint mission has completed successfully!');
        updateMissionStatus();
        setCurrentProgress(0);
        break;
      
      case 'missionFailed':
        Alert.alert('Mission Failed', event.error || 'The mission failed for an unknown reason.');
        updateMissionStatus();
        setCurrentProgress(0);
        break;
      
      case 'missionPaused':
        Alert.alert('Mission Paused', 'The mission has been paused.');
        updateMissionStatus();
        break;
      
      case 'missionResumed':
        Alert.alert('Mission Resumed', 'The mission has been resumed.');
        updateMissionStatus();
        break;
    }
  };

  const updateMissionStatus = async () => {
    try {
      const status = await ExpoDjiSdk.getKMLMissionStatus();
      setMissionStatus(status);
    } catch (error) {
      console.warn('Failed to get mission status:', error);
    }
  };

  const selectKMLFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.google-earth.kml+xml', '*/*'],
        copyToCacheDirectory: true, // Enable copying to cache
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setFileName(asset.name);
        
        console.log('Selected file:', asset.name);
        console.log('File URI:', asset.uri);
        console.log('File size:', asset.size);
        
        let fileContent: string;
        
        if (asset.uri.startsWith('file://')) {
          // If it's already a file URI (copied to cache), read directly
          console.log('Reading from file URI...');
          fileContent = await FileSystem.readAsStringAsync(asset.uri);
        } else {
          // If it's still a content URI, copy it first then read
          console.log('Converting content URI to file...');
          const fileName = asset.name || `kml_${Date.now()}.kml`;
          const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
          
          // Copy the file to cache directory
          await FileSystem.copyAsync({
            from: asset.uri,
            to: fileUri
          });
          
          console.log('File copied to:', fileUri);
          
          // Now read the copied file
          fileContent = await FileSystem.readAsStringAsync(fileUri);
        }
        
        console.log('File content length:', fileContent.length);
        console.log('First 200 chars:', fileContent.substring(0, 200));
        
        // Store the content for later use
        setSelectedFile(fileContent); // Now storing content instead of path
        
        // Preview the mission using the content
        previewMissionFromContent(fileContent);
      }
    } catch (error) {
      console.error('Error selecting file:', error);
      Alert.alert('Error', `Failed to select KML file: ${error.message}`);
    }
  };

  const previewMissionFromContent = async (kmlContent: string) => {
    setIsLoading(true);
    try {
      const preview = await ExpoDjiSdk.previewKMLMissionFromContent(kmlContent);
      setMissionPreview(preview);
      
      if (!preview.isValid) {
        Alert.alert(
          'Mission Issues Found',
          `The mission has the following issues:\n\n${preview.issues.join('\n')}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error previewing mission:', error);
      Alert.alert('Error', 'Failed to preview KML mission');
      setMissionPreview(null);
    } finally {
      setIsLoading(false);
    }
  };

  const startMission = async () => {
    if (!selectedFile) {
      Alert.alert('Error', 'Please select a KML file first');
      return;
    }

    const config: KMLMissionConfig = {
      speed: 5.0,
      maxSpeed: 10.0,
      enableTakePhoto: true,
      enableStartRecording: false
    };

    Alert.alert(
      'Start Mission',
      'Are you sure you want to start the waypoint mission? Make sure the drone is ready for takeoff.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            setIsLoading(true);
            try {
              const result = await ExpoDjiSdk.importKMLMissionFromContent(selectedFile, config);
              console.log('Mission result:', result);
              
              if (result.success) {
                Alert.alert(
                  'Mission Loaded',
                  `Mission loaded with ${result.waypoints} waypoints using ${result.missionType} mode.`
                );
              } else {
                throw new Error(result.error || 'Failed to start mission');
              }
            } catch (error) {
              console.error('Error starting mission:', error);
              Alert.alert('Error', `Failed to start mission: ${error}`);
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  const pauseMission = async () => {
    try {
      await ExpoDjiSdk.pauseKMLMission();
    } catch (error) {
      Alert.alert('Error', `Failed to pause mission: ${error}`);
    }
  };

  const resumeMission = async () => {
    try {
      await ExpoDjiSdk.resumeKMLMission();
    } catch (error) {
      Alert.alert('Error', `Failed to resume mission: ${error}`);
    }
  };

  const stopMission = async () => {
    Alert.alert(
      'Stop Mission',
      'Are you sure you want to stop the current mission?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
          onPress: async () => {
            try {
              await ExpoDjiSdk.stopKMLMission();
            } catch (error) {
              Alert.alert('Error', `Failed to stop mission: ${error}`);
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

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>KML Mission Control</Text>
        
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

        {/* Mission Preview */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading mission...</Text>
          </View>
        )}

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
              <Text style={styles.previewLabel}>Mission Type:</Text>
              <Text style={styles.previewValue}>
                {missionPreview.supportsNativeWaypoints ? 'Native Waypoint' : 'Virtual Stick'}
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
                {missionPreview.issues.map((issue, index) => (
                  <Text key={index} style={styles.issueText}>• {issue}</Text>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Mission Controls */}
        {missionPreview && missionPreview.isValid && (
          <View style={styles.controlsContainer}>
            <TouchableOpacity 
              style={[styles.button, styles.startButton]} 
              onPress={startMission}
              disabled={isLoading || (missionStatus?.isRunning && !missionStatus?.isPaused)}
            >
              <Text style={styles.buttonText}>Start Mission</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Mission Status */}
        {missionStatus && missionStatus.isRunning && (
          <View style={styles.statusContainer}>
            <Text style={styles.statusTitle}>Mission Status</Text>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Status:</Text>
              <Text style={styles.statusValue}>
                {missionStatus.isPaused ? 'Paused' : 'Running'}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Type:</Text>
              <Text style={styles.statusValue}>{missionStatus.missionType}</Text>
            </View>
            
            {currentProgress > 0 && (
              <View style={styles.progressContainer}>
                <Text style={styles.progressLabel}>Progress: {(currentProgress * 100).toFixed(0)}%</Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${currentProgress * 100}%` }]} />
                </View>
              </View>
            )}

            <View style={styles.missionControls}>
              {missionStatus.isPaused ? (
                <TouchableOpacity style={[styles.button, styles.resumeButton]} onPress={resumeMission}>
                  <Text style={styles.buttonText}>Resume</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.button, styles.pauseButton]} onPress={pauseMission}>
                  <Text style={styles.buttonText}>Pause</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity style={[styles.button, styles.stopButton]} onPress={stopMission}>
                <Text style={styles.buttonText}>Stop</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Mission Stats */}
        {missionStats && (
          <View style={styles.statsContainer}>
            <Text style={styles.statsTitle}>Current Mission Stats</Text>
            <View style={styles.statsRow}>
              <Text style={styles.statsLabel}>Total Distance:</Text>
              <Text style={styles.statsValue}>{formatDistance(missionStats.totalDistance)}</Text>
            </View>
            <View style={styles.statsRow}>
              <Text style={styles.statsLabel}>Altitude Range:</Text>
              <Text style={styles.statsValue}>
                {missionStats.minAltitude.toFixed(0)}m - {missionStats.maxAltitude.toFixed(0)}m
              </Text>
            </View>
          </View>
        )}
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
  startButton: {
    backgroundColor: '#28a745',
  },
  pauseButton: {
    backgroundColor: '#ffc107',
    flex: 1,
    marginRight: 4,
  },
  resumeButton: {
    backgroundColor: '#28a745',
    flex: 1,
    marginRight: 4,
  },
  stopButton: {
    backgroundColor: '#dc3545',
    flex: 1,
    marginLeft: 4,
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
  statusContainer: {
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
    flex: 1,
    fontWeight: '600',
    color: '#666',
  },
  statusValue: {
    flex: 2,
    color: '#333',
  },
  progressContainer: {
    marginTop: 12,
  },
  progressLabel: {
    marginBottom: 8,
    fontWeight: '600',
    color: '#333',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e9ecef',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
  },
  missionControls: {
    flexDirection: 'row',
    marginTop: 16,
  },
  statsContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  statsLabel: {
    flex: 1,
    fontWeight: '600',
    color: '#666',
  },
  statsValue: {
    flex: 2,
    color: '#333',
  },
});

export default KMLMissionScreen;