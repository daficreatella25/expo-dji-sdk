import React, { useState, useEffect } from 'react';
import { View, Text, Button, Alert, ScrollView, SafeAreaView, TextInput, StyleSheet } from 'react-native';
import { useEvent } from 'expo';
import ExpoDjiSdk from 'expo-dji-sdk';
import { VirtualJoystick } from '../components/VirtualJoystick';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

interface SimulatorScreenProps {
  navigation: any;
}

export const SimulatorScreen: React.FC<SimulatorScreenProps> = ({ navigation }) => {
  // Simulation state
  const [simulatorEnabled, setSimulatorEnabled] = useState(false);
  const [simulatorState, setSimulatorState] = useState<any>(null);
  const [latitude, setLatitude] = useState('22.5797650');
  const [longitude, setLongitude] = useState('113.9411710');
  const [satelliteCount, setSatelliteCount] = useState('12');
  
  // Virtual stick state
  const [virtualStickEnabled, setVirtualStickEnabled] = useState(false);
  const [virtualStickState, setVirtualStickState] = useState<any>(null);
  const [speedLevel, setSpeedLevel] = useState('0.5');
  
  // Motor and flight state
  const [motorsRunning, setMotorsRunning] = useState(false);
  const [isFlying, setIsFlying] = useState(false);
  
  // Joystick values
  const [leftStick, setLeftStick] = useState({ x: 0, y: 0 });
  const [rightStick, setRightStick] = useState({ x: 0, y: 0 });

  const onSimulatorStateChange = useEvent(ExpoDjiSdk, 'onSimulatorStateChange');
  const onVirtualStickStateChange = useEvent(ExpoDjiSdk, 'onVirtualStickStateChange');

  useEffect(() => {
    if (onSimulatorStateChange) {
      console.log('Simulator state change:', onSimulatorStateChange);
      if (onSimulatorStateChange.type === 'stateUpdate' && onSimulatorStateChange.state) {
        setSimulatorState(onSimulatorStateChange.state);
        setSimulatorEnabled(onSimulatorStateChange.state.isEnabled);
        setMotorsRunning(onSimulatorStateChange.state.areMotorsOn);
        setIsFlying(onSimulatorStateChange.state.isFlying);
      }
    }
  }, [onSimulatorStateChange]);

  useEffect(() => {
    if (onVirtualStickStateChange) {
      console.log('Virtual stick state change:', onVirtualStickStateChange);
      if (onVirtualStickStateChange.type === 'stateUpdate' && onVirtualStickStateChange.state) {
        setVirtualStickState(onVirtualStickStateChange.state);
        setVirtualStickEnabled(onVirtualStickStateChange.state.isVirtualStickEnabled);
      }
    }
  }, [onVirtualStickStateChange]);

  // Simulation methods
  const enableSimulator = async () => {
    try {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      const satCount = parseInt(satelliteCount);
      
      if (isNaN(lat) || isNaN(lng) || isNaN(satCount)) {
        Alert.alert('Error', 'Please enter valid numbers for coordinates and satellite count');
        return;
      }
      
      const result = await ExpoDjiSdk.enableSimulator(lat, lng, satCount);
      if (result.success) {
        Alert.alert('Success', 'Simulator enabled successfully!');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to enable simulator');
    }
  };

  const disableSimulator = async () => {
    try {
      const result = await ExpoDjiSdk.disableSimulator();
      if (result.success) {
        Alert.alert('Success', 'Simulator disabled successfully!');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to disable simulator');
    }
  };

  // Virtual stick methods
  const enableVirtualStick = async () => {
    try {
      const result = await ExpoDjiSdk.enableVirtualStick();
      if (result.success) {
        Alert.alert('Success', 'Virtual stick enabled successfully!');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to enable virtual stick');
    }
  };

  const disableVirtualStick = async () => {
    try {
      const result = await ExpoDjiSdk.disableVirtualStick();
      if (result.success) {
        Alert.alert('Success', 'Virtual stick disabled successfully!');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to disable virtual stick');
    }
  };

  const setVirtualStickSpeed = async () => {
    try {
      const speed = parseFloat(speedLevel);
      if (isNaN(speed) || speed < 0.1 || speed > 1.0) {
        Alert.alert('Error', 'Speed level must be between 0.1 and 1.0');
        return;
      }
      
      const result = await ExpoDjiSdk.setVirtualStickSpeedLevel(speed);
      if (result.success) {
        Alert.alert('Success', `Speed level set to ${speed}`);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to set speed level');
    }
  };

  // Note: Motor control is handled automatically by the flight controller
  // Motors will start when takeoff is initiated and stop when landing is complete

  // Flight control methods
  const takeoff = async () => {
    try {
      const result = await ExpoDjiSdk.takeoff();
      if (result.success) {
        Alert.alert('Success', 'Takeoff initiated successfully!');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to takeoff');
    }
  };

  const land = async () => {
    try {
      const result = await ExpoDjiSdk.land();
      if (result.success) {
        Alert.alert('Success', 'Landing initiated successfully!');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to land');
    }
  };

  const cancelLanding = async () => {
    try {
      const result = await ExpoDjiSdk.cancelLanding();
      if (result.success) {
        Alert.alert('Success', 'Landing cancelled successfully!');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to cancel landing');
    }
  };

  // Joystick control handlers
  const handleLeftStickMove = async (x: number, y: number) => {
    setLeftStick({ x, y });
    if (virtualStickEnabled) {
      try {
        // Convert normalized values (-1 to 1) to stick positions
        // DJI uses range approximately -660 to 660 for stick positions
        const horizontalPos = Math.round(x * 660);
        const verticalPos = Math.round(y * 660);
        
        await ExpoDjiSdk.setVirtualStickControlData(
          horizontalPos, // Left horizontal (yaw)
          verticalPos,   // Left vertical (throttle)
          rightStick.x * 660, // Right horizontal (roll)
          rightStick.y * 660  // Right vertical (pitch)
        );
      } catch (error) {
        console.error('Failed to set left stick control:', error);
      }
    }
  };

  const handleRightStickMove = async (x: number, y: number) => {
    setRightStick({ x, y });
    if (virtualStickEnabled) {
      try {
        // Convert normalized values to stick positions
        const horizontalPos = Math.round(x * 660);
        const verticalPos = Math.round(y * 660);
        
        await ExpoDjiSdk.setVirtualStickControlData(
          leftStick.x * 660,  // Left horizontal (yaw)
          leftStick.y * 660,  // Left vertical (throttle)
          horizontalPos,      // Right horizontal (roll)
          verticalPos         // Right vertical (pitch)
        );
      } catch (error) {
        console.error('Failed to set right stick control:', error);
      }
    }
  };

  // Quick location presets
  const quickLocations = [
    { name: 'China (Shenzhen)', lat: 22.5797650, lng: 113.9411710 },
    { name: 'USA (Los Angeles)', lat: 34.063191, lng: -118.121621 },
    { name: 'Japan (Tokyo)', lat: 35.658890, lng: 139.746074 },
    { name: 'France (Paris)', lat: 48.860284, lng: 2.336282 },
    { name: 'Germany (Berlin)', lat: 52.516294, lng: 13.376631 },
  ];

  const selectQuickLocation = () => {
    Alert.alert(
      'Quick Locations',
      'Select a preset location:',
      quickLocations.map(location => ({
        text: location.name,
        onPress: () => {
          setLatitude(location.lat.toString());
          setLongitude(location.lng.toString());
        }
      }))
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <ScrollView style={styles.scrollView}>
          {/* Header */}
          <View style={styles.header}>
            <Button title="← Back" onPress={() => navigation.goBack()} />
            <Text style={styles.title}>Drone Simulator</Text>
          </View>

          {/* Simulator Setup */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Simulator Setup</Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Latitude:</Text>
              <TextInput
                style={styles.input}
                value={latitude}
                onChangeText={setLatitude}
                placeholder="22.5797650"
                keyboardType="numeric"
              />
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Longitude:</Text>
              <TextInput
                style={styles.input}
                value={longitude}
                onChangeText={setLongitude}
                placeholder="113.9411710"
                keyboardType="numeric"
              />
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Satellites:</Text>
              <TextInput
                style={styles.input}
                value={satelliteCount}
                onChangeText={setSatelliteCount}
                placeholder="12"
                keyboardType="numeric"
              />
            </View>

            <Button title="Quick Locations" onPress={selectQuickLocation} />
            
            <View style={styles.buttonRow}>
              <Button
                title="Enable Simulator"
                onPress={enableSimulator}
                disabled={simulatorEnabled}
              />
              <Button
                title="Disable Simulator"
                onPress={disableSimulator}
                disabled={!simulatorEnabled}
              />
            </View>
            
            <Text style={styles.status}>
              Status: {simulatorEnabled ? '🟢 Enabled' : '🔴 Disabled'}
            </Text>
          </View>

          {/* Flight Controls */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Flight Control</Text>
            
            <View style={styles.buttonRow}>
              <Button
                title="🚁 Takeoff"
                onPress={takeoff}
                disabled={!simulatorEnabled || isFlying}
              />
              <Button
                title="🛬 Land"
                onPress={land}
                disabled={!simulatorEnabled || !isFlying}
              />
            </View>
            
            <Button
              title="❌ Cancel Landing"
              onPress={cancelLanding}
              disabled={!simulatorEnabled}
            />
            
            <View style={styles.statusRow}>
              <Text style={styles.statusIndicator}>
                Motors: {motorsRunning ? '🟢 RUNNING' : '🔴 STOPPED'}
              </Text>
              <Text style={styles.statusIndicator}>
                Flight: {isFlying ? '✈️ FLYING' : '🛬 GROUNDED'}
              </Text>
            </View>
            
            <Text style={styles.infoNote}>
              💡 Motors automatically start with takeoff and stop with landing
            </Text>
          </View>

          {/* Enhanced Telemetry */}
          {simulatorState && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Live Telemetry Data</Text>
              <View style={styles.telemetryGrid}>
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>Motors</Text>
                  <Text style={styles.telemetryValue}>
                    {simulatorState.areMotorsOn ? '🟢 ON' : '🔴 OFF'}
                  </Text>
                </View>
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>Flying</Text>
                  <Text style={styles.telemetryValue}>
                    {simulatorState.isFlying ? '✈️ YES' : '🛬 NO'}
                  </Text>
                </View>
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>Roll</Text>
                  <Text style={styles.telemetryValue}>{simulatorState.roll?.toFixed(1)}°</Text>
                </View>
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>Pitch</Text>
                  <Text style={styles.telemetryValue}>{simulatorState.pitch?.toFixed(1)}°</Text>
                </View>
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>Yaw</Text>
                  <Text style={styles.telemetryValue}>{simulatorState.yaw?.toFixed(1)}°</Text>
                </View>
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>Altitude</Text>
                  <Text style={styles.telemetryValue}>{simulatorState.positionZ?.toFixed(1)}m</Text>
                </View>
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>Velocity X</Text>
                  <Text style={styles.telemetryValue}>{simulatorState.velocityX?.toFixed(2)} m/s</Text>
                </View>
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>Velocity Y</Text>
                  <Text style={styles.telemetryValue}>{simulatorState.velocityY?.toFixed(2)} m/s</Text>
                </View>
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>Velocity Z</Text>
                  <Text style={styles.telemetryValue}>{simulatorState.velocityZ?.toFixed(2)} m/s</Text>
                </View>
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>Wind X</Text>
                  <Text style={styles.telemetryValue}>{simulatorState.windSpeedX?.toFixed(1)} m/s</Text>
                </View>
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>Wind Y</Text>
                  <Text style={styles.telemetryValue}>{simulatorState.windSpeedY?.toFixed(1)} m/s</Text>
                </View>
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>Wind Z</Text>
                  <Text style={styles.telemetryValue}>{simulatorState.windSpeedZ?.toFixed(1)} m/s</Text>
                </View>
              </View>
              
              <View style={styles.positionContainer}>
                <Text style={styles.positionTitle}>Position Data:</Text>
                <Text style={styles.positionText}>
                  GPS: {simulatorState.latitude?.toFixed(6)}, {simulatorState.longitude?.toFixed(6)}
                </Text>
                <Text style={styles.positionText}>
                  XYZ: ({simulatorState.positionX?.toFixed(2)}, {simulatorState.positionY?.toFixed(2)}, {simulatorState.positionZ?.toFixed(2)})
                </Text>
                <Text style={styles.positionText}>
                  Speed: {Math.sqrt((simulatorState.velocityX || 0)**2 + (simulatorState.velocityY || 0)**2 + (simulatorState.velocityZ || 0)**2).toFixed(2)} m/s
                </Text>
              </View>
            </View>
          )}

          {/* Virtual Stick Controls */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Virtual Stick Control</Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Speed Level (0.1 - 1.0):</Text>
              <TextInput
                style={styles.input}
                value={speedLevel}
                onChangeText={setSpeedLevel}
                placeholder="0.5"
                keyboardType="numeric"
              />
            </View>
            
            <Button title="Set Speed" onPress={setVirtualStickSpeed} />
            
            <View style={styles.buttonRow}>
              <Button
                title="Enable Virtual Stick"
                onPress={enableVirtualStick}
                disabled={virtualStickEnabled}
              />
              <Button
                title="Disable Virtual Stick"
                onPress={disableVirtualStick}
                disabled={!virtualStickEnabled}
              />
            </View>
            
            <Text style={styles.status}>
              Virtual Stick: {virtualStickEnabled ? '🟢 Enabled' : '🔴 Disabled'}
            </Text>
          </View>

          {/* Joystick Controls */}
          {virtualStickEnabled && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Flight Controls</Text>
              
              <View style={styles.joystickContainer}>
                <View style={styles.joystickGroup}>
                  <Text style={styles.joystickLabel}>Left Stick</Text>
                  <Text style={styles.joystickSubLabel}>Throttle & Yaw</Text>
                  <VirtualJoystick
                    onMove={handleLeftStickMove}
                    size={120}
                    knobColor="#FF6B6B"
                    style={styles.joystick}
                  />
                  <Text style={styles.joystickValues}>
                    X: {leftStick.x.toFixed(2)} Y: {leftStick.y.toFixed(2)}
                  </Text>
                </View>
                
                <View style={styles.joystickGroup}>
                  <Text style={styles.joystickLabel}>Right Stick</Text>
                  <Text style={styles.joystickSubLabel}>Roll & Pitch</Text>
                  <VirtualJoystick
                    onMove={handleRightStickMove}
                    size={120}
                    knobColor="#4ECDC4"
                    style={styles.joystick}
                  />
                  <Text style={styles.joystickValues}>
                    X: {rightStick.x.toFixed(2)} Y: {rightStick.y.toFixed(2)}
                  </Text>
                </View>
              </View>
              
              <View style={styles.controlsLegend}>
                <Text style={styles.legendTitle}>Controls:</Text>
                <Text style={styles.legendItem}>• Left Stick: Up/Down = Throttle, Left/Right = Yaw</Text>
                <Text style={styles.legendItem}>• Right Stick: Up/Down = Pitch, Left/Right = Roll</Text>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginLeft: 20,
    color: '#333',
  },
  section: {
    margin: 15,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  inputContainer: {
    marginBottom: 15,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 5,
    color: '#555',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 15,
  },
  status: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 10,
  },
  telemetryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  telemetryItem: {
    width: '48%',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  telemetryLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  telemetryValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  joystickContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginVertical: 20,
  },
  joystickGroup: {
    alignItems: 'center',
  },
  joystickLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#333',
  },
  joystickSubLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  joystick: {
    marginBottom: 8,
  },
  joystickValues: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
  },
  controlsLegend: {
    backgroundColor: '#f0f8ff',
    padding: 15,
    borderRadius: 8,
    marginTop: 15,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#007acc',
  },
  legendItem: {
    fontSize: 12,
    color: '#555',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 15,
    paddingVertical: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  statusIndicator: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  positionContainer: {
    marginTop: 15,
    padding: 12,
    backgroundColor: '#e8f4f8',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007acc',
  },
  positionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#007acc',
  },
  positionText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#333',
    marginBottom: 4,
  },
  infoNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 10,
  },
});