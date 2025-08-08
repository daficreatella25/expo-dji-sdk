import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Joystick, { JoystickValue } from '../components/Joystick';
import { sendVirtualStickCommand, setVirtualStickModeEnabled, getVirtualStickStatus } from 'expo-dji-sdk';

export default function JoystickTest() {
  const navigation = useNavigation();
  const [leftValue, setLeftValue] = useState<JoystickValue>({ x: 0, y: 0 });
  const [rightValue, setRightValue] = useState<JoystickValue>({ x: 0, y: 0 });
  const [leftActive, setLeftActive] = useState(false);
  const [rightActive, setRightActive] = useState(false);
  const [virtualStickEnabled, setVirtualStickEnabled] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const addDebugLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `${timestamp}: ${message}`;
    console.log(`[JoystickTest] ${logEntry}`);
    setDebugLog(prev => [logEntry, ...prev].slice(0, 10)); // Keep last 10 logs
  };

  const handleLeftJoystickChange = (value: JoystickValue) => {
    setLeftValue(value);
    if (virtualStickEnabled) {
      sendVirtualStickTest(value.x, value.y, rightValue.x, rightValue.y);
    }
  };

  const handleRightJoystickChange = (value: JoystickValue) => {
    setRightValue(value);
    if (virtualStickEnabled) {
      sendVirtualStickTest(leftValue.x, leftValue.y, value.x, value.y);
    }
  };

  const sendVirtualStickTest = async (leftX: number, leftY: number, rightX: number, rightY: number) => {
    try {
      if (typeof sendVirtualStickCommand === 'function') {
        await sendVirtualStickCommand(leftX, leftY, rightX, rightY);
        addDebugLog(`VS Command: L(${leftX.toFixed(2)}, ${leftY.toFixed(2)}) R(${rightX.toFixed(2)}, ${rightY.toFixed(2)})`);
      } else {
        addDebugLog('sendVirtualStickCommand not available');
      }
    } catch (error: any) {
      addDebugLog(`VS Error: ${error?.message || 'Unknown error'}`);
    }
  };

  const toggleVirtualStick = async () => {
    try {
      if (typeof setVirtualStickModeEnabled === 'function') {
        await setVirtualStickModeEnabled(!virtualStickEnabled);
        setVirtualStickEnabled(!virtualStickEnabled);
        addDebugLog(`Virtual Stick ${!virtualStickEnabled ? 'Enabled' : 'Disabled'}`);
      } else {
        addDebugLog('setVirtualStickModeEnabled not available');
        Alert.alert('Error', 'Virtual stick functions not available. SDK may not be initialized.');
      }
    } catch (error: any) {
      addDebugLog(`Toggle Error: ${error?.message || 'Unknown error'}`);
      Alert.alert('Virtual Stick Error', error?.message || 'Unknown error');
    }
  };

  const checkVirtualStickStatus = async () => {
    try {
      if (typeof getVirtualStickStatus === 'function') {
        const status = await getVirtualStickStatus();
        addDebugLog(`Status: Speed=${status.speedLevel}`);
        Alert.alert('Virtual Stick Status', 
          `Speed Level: ${status.speedLevel}\n\n${status.note}\n\n${status.suggestion}`
        );
      } else {
        addDebugLog('getVirtualStickStatus not available');
      }
    } catch (error: any) {
      addDebugLog(`Status Error: ${error?.message || 'Unknown error'}`);
      Alert.alert('Status Error', error?.message || 'Unknown error');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🕹️ Joystick Test</Text>
      
      {/* Virtual Stick Toggle */}
      <TouchableOpacity 
        style={[
          styles.toggleButton,
          virtualStickEnabled ? styles.enabledButton : styles.disabledButton
        ]} 
        onPress={toggleVirtualStick}
      >
        <Text style={styles.toggleButtonText}>
          {virtualStickEnabled ? '✅ Virtual Stick ON' : '❌ Virtual Stick OFF'}
        </Text>
      </TouchableOpacity>

      {/* Status Check Button */}
      <TouchableOpacity 
        style={[styles.statusButton]} 
        onPress={checkVirtualStickStatus}
      >
        <Text style={styles.toggleButtonText}>
          🔍 Check Status & Requirements
        </Text>
      </TouchableOpacity>

      {/* Joysticks */}
      <View style={styles.joysticksContainer}>
        <Joystick
          label="Throttle / Yaw"
          onValueChange={handleLeftJoystickChange}
          onStart={() => setLeftActive(true)}
          onEnd={() => setLeftActive(false)}
          isActive={leftActive}
        />
        
        <Joystick
          label="Roll / Pitch"
          onValueChange={handleRightJoystickChange}
          onStart={() => setRightActive(true)}
          onEnd={() => setRightActive(false)}
          isActive={rightActive}
        />
      </View>

      {/* Values Display */}
      <View style={styles.valuesContainer}>
        <View style={styles.valueBox}>
          <Text style={styles.valueTitle}>Left Stick</Text>
          <Text style={styles.valueText}>X: {leftValue.x.toFixed(3)}</Text>
          <Text style={styles.valueText}>Y: {leftValue.y.toFixed(3)}</Text>
          <Text style={styles.valueStatus}>{leftActive ? '🟢 Active' : '⚪ Idle'}</Text>
        </View>
        
        <View style={styles.valueBox}>
          <Text style={styles.valueTitle}>Right Stick</Text>
          <Text style={styles.valueText}>X: {rightValue.x.toFixed(3)}</Text>
          <Text style={styles.valueText}>Y: {rightValue.y.toFixed(3)}</Text>
          <Text style={styles.valueStatus}>{rightActive ? '🟢 Active' : '⚪ Idle'}</Text>
        </View>
      </View>

      {/* Debug Log */}
      <View style={styles.debugContainer}>
        <Text style={styles.debugTitle}>Debug Log:</Text>
        {debugLog.map((log, index) => (
          <Text key={index} style={styles.debugText}>{log}</Text>
        ))}
      </View>

      {/* Back Button */}
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 20,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  toggleButton: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 10,
    alignSelf: 'center',
    marginBottom: 30,
  },
  enabledButton: {
    backgroundColor: '#00aa00',
  },
  disabledButton: {
    backgroundColor: '#666',
  },
  statusButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 10,
    alignSelf: 'center',
    marginBottom: 20,
  },
  toggleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  joysticksContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 30,
  },
  valuesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  valueBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 15,
    borderRadius: 10,
    minWidth: 120,
  },
  valueTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
    textAlign: 'center',
  },
  valueText: {
    color: '#00ff66',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  valueStatus: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 5,
  },
  debugContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 10,
    borderRadius: 5,
    maxHeight: 150,
    marginBottom: 20,
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
  backButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 10,
    alignSelf: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});