import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet, Alert } from 'react-native';
import ExpoDjiSdk, {
  startTakeoff,
  startLanding,
  cancelLanding,
  enableVirtualStick,
  disableVirtualStick,
  sendVirtualStickCommand,
  setVirtualStickModeEnabled,
  setVirtualStickControlMode,
  getFlightStatus,
  isReadyForTakeoff,
  startCompassCalibration,
  getCompassCalibrationStatus,
  FlightStatus,
  ReadinessCheck,
  CompassCalibrationStatus,
  TakeoffResult,
  LandingResult,
} from './src';

export default function VirtualStickExample() {
  const [flightStatus, setFlightStatus] = useState<FlightStatus | null>(null);
  const [readinessCheck, setReadinessCheck] = useState<ReadinessCheck | null>(null);
  const [calibrationStatus, setCalibrationStatus] = useState<CompassCalibrationStatus | null>(null);
  const [virtualStickEnabled, setVirtualStickEnabled] = useState(false);

  useEffect(() => {
    // Set up event listeners
    const takeoffSubscription = ExpoDjiSdk.addListener('onTakeoffResult', (result: TakeoffResult) => {
      Alert.alert('Takeoff Result', result.success ? result.message : result.error);
    });

    const landingSubscription = ExpoDjiSdk.addListener('onLandingResult', (result: LandingResult) => {
      Alert.alert('Landing Result', result.success ? result.message : result.error);
    });

    const flightStatusSubscription = ExpoDjiSdk.addListener('onFlightStatusChange', (status: FlightStatus) => {
      setFlightStatus(status);
    });

    return () => {
      takeoffSubscription?.remove();
      landingSubscription?.remove();
      flightStatusSubscription?.remove();
    };
  }, []);

  const handleTakeoff = async () => {
    try {
      const readiness = await isReadyForTakeoff();
      setReadinessCheck(readiness);
      
      if (!readiness.ready) {
        Alert.alert('Not Ready for Takeoff', readiness.reason);
        return;
      }

      const result = await startTakeoff();
      console.log('Takeoff result:', result);
    } catch (error) {
      Alert.alert('Takeoff Error', `Failed to start takeoff: ${error}`);
    }
  };

  const handleLanding = async () => {
    try {
      const result = await startLanding();
      console.log('Landing result:', result);
    } catch (error) {
      Alert.alert('Landing Error', `Failed to start landing: ${error}`);
    }
  };

  const handleEnableVirtualStick = async () => {
    try {
      // First set control modes
      await setVirtualStickControlMode('VELOCITY', 'ANGULAR_VELOCITY', 'VELOCITY', 'GROUND');
      
      // Then enable virtual stick
      const result = await setVirtualStickModeEnabled(true);
      setVirtualStickEnabled(result.enabled);
      Alert.alert('Virtual Stick', 'Virtual Stick enabled successfully');
    } catch (error) {
      Alert.alert('Virtual Stick Error', `Failed to enable virtual stick: ${error}`);
    }
  };

  const handleDisableVirtualStick = async () => {
    try {
      const result = await setVirtualStickModeEnabled(false);
      setVirtualStickEnabled(result.enabled);
      Alert.alert('Virtual Stick', 'Virtual Stick disabled successfully');
    } catch (error) {
      Alert.alert('Virtual Stick Error', `Failed to disable virtual stick: ${error}`);
    }
  };

  const handleMoveForward = async () => {
    try {
      // Move forward: positive pitch
      await sendVirtualStickCommand(0, 0, 0, 0.3);
      setTimeout(() => sendVirtualStickCommand(0, 0, 0, 0), 1000); // Stop after 1 second
    } catch (error) {
      Alert.alert('Movement Error', `Failed to move forward: ${error}`);
    }
  };

  const handleHover = async () => {
    try {
      // Hover: all commands at 0
      await sendVirtualStickCommand(0, 0, 0, 0);
    } catch (error) {
      Alert.alert('Movement Error', `Failed to hover: ${error}`);
    }
  };

  const handleGetFlightStatus = async () => {
    try {
      const status = await getFlightStatus();
      setFlightStatus(status);
      Alert.alert('Flight Status', JSON.stringify(status, null, 2));
    } catch (error) {
      Alert.alert('Status Error', `Failed to get flight status: ${error}`);
    }
  };

  const handleCompassCalibration = async () => {
    try {
      await startCompassCalibration();
      Alert.alert('Compass Calibration', 'Calibration started');
      
      // Check status periodically
      const interval = setInterval(async () => {
        try {
          const status = await getCompassCalibrationStatus();
          setCalibrationStatus(status);
          
          if (status.status === 'SUCCEEDED' || status.status === 'FAILED') {
            clearInterval(interval);
            Alert.alert('Calibration Complete', status.description);
          }
        } catch (error) {
          clearInterval(interval);
        }
      }, 1000);
    } catch (error) {
      Alert.alert('Calibration Error', `Failed to start compass calibration: ${error}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>DJI Virtual Stick Control</Text>
      
      {/* Flight Status Display */}
      {flightStatus && (
        <View style={styles.statusContainer}>
          <Text style={styles.statusTitle}>Flight Status:</Text>
          <Text>Connected: {flightStatus.isConnected ? 'Yes' : 'No'}</Text>
          <Text>Motors On: {flightStatus.areMotorsOn ? 'Yes' : 'No'}</Text>
          <Text>Flying: {flightStatus.isFlying ? 'Yes' : 'No'}</Text>
          <Text>Flight Mode: {flightStatus.flightMode}</Text>
        </View>
      )}

      {/* Readiness Check Display */}
      {readinessCheck && (
        <View style={styles.statusContainer}>
          <Text style={styles.statusTitle}>Takeoff Readiness:</Text>
          <Text>Ready: {readinessCheck.ready ? 'Yes' : 'No'}</Text>
          <Text>Reason: {readinessCheck.reason}</Text>
        </View>
      )}

      {/* Calibration Status Display */}
      {calibrationStatus && (
        <View style={styles.statusContainer}>
          <Text style={styles.statusTitle}>Compass Calibration:</Text>
          <Text>Status: {calibrationStatus.status}</Text>
          <Text>Description: {calibrationStatus.description}</Text>
        </View>
      )}

      {/* Control Buttons */}
      <View style={styles.buttonContainer}>
        <Button title="Get Flight Status" onPress={handleGetFlightStatus} />
        <Button title="Start Compass Calibration" onPress={handleCompassCalibration} />
        <Button title="Takeoff" onPress={handleTakeoff} />
        <Button title="Landing" onPress={handleLanding} />
      </View>

      {/* Virtual Stick Controls */}
      <View style={styles.buttonContainer}>
        <Button 
          title={virtualStickEnabled ? "Disable Virtual Stick" : "Enable Virtual Stick"} 
          onPress={virtualStickEnabled ? handleDisableVirtualStick : handleEnableVirtualStick} 
        />
        
        {virtualStickEnabled && (
          <>
            <Button title="Move Forward" onPress={handleMoveForward} />
            <Button title="Hover" onPress={handleHover} />
          </>
        )}
      </View>

      <Text style={styles.instructions}>
        Complete Flow:{'\n'}
        1. Start Compass Calibration if needed{'\n'}
        2. Check Flight Status{'\n'}
        3. Takeoff{'\n'}
        4. Enable Virtual Stick{'\n'}
        5. Control drone movement{'\n'}
        6. Land when finished
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  statusContainer: {
    backgroundColor: '#f0f0f0',
    padding: 15,
    marginBottom: 15,
    borderRadius: 8,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  buttonContainer: {
    marginBottom: 20,
    gap: 10,
  },
  instructions: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#e8f4ff',
    borderRadius: 8,
    fontSize: 14,
    lineHeight: 20,
  },
});