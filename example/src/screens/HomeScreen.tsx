import { useEvent } from 'expo';
import ExpoDjiSdk, { testSDKClass, initializeSDK, DroneConnectionStatus, getDetailedDroneInfo, DetailedDroneInfo } from 'expo-dji-sdk';
import { Button, SafeAreaView, ScrollView, Text, View, Alert, StyleSheet } from 'react-native';
import { useState, useEffect } from 'react';

interface HomeScreenProps {
  navigation: any;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const [sdkInitialized, setSdkInitialized] = useState(false);
  const [droneConnected, setDroneConnected] = useState(false);
  const [droneConnectionStatus, setDroneConnectionStatus] = useState<DroneConnectionStatus | null>(null);
  const [droneInfo, setDroneInfo] = useState<any>(null);
  const [detailedDroneInfo, setDetailedDroneInfo] = useState<DetailedDroneInfo | null>(null);
  const [initResult, setInitResult] = useState<string>('');
  const [testResult, setTestResult] = useState<string>('');

  const onDroneConnectionChange = useEvent(ExpoDjiSdk, 'onDroneConnectionChange');
  const onDroneInfoUpdate = useEvent(ExpoDjiSdk, 'onDroneInfoUpdate');

  useEffect(() => {
    if (onDroneConnectionChange) {
      setDroneConnected(onDroneConnectionChange.connected);
      console.log('Drone connection changed:', onDroneConnectionChange);
    }
  }, [onDroneConnectionChange]);

  useEffect(() => {
    if (onDroneInfoUpdate) {
      console.log('Drone info update:', onDroneInfoUpdate);
      if (onDroneInfoUpdate.type === 'basicInfo' || onDroneInfoUpdate.type === 'healthInfo') {
        setDroneInfo(onDroneInfoUpdate.data);
      } else if (onDroneInfoUpdate.type === 'error') {
        Alert.alert('Error', onDroneInfoUpdate.error || 'Unknown error');
      }
    }
  }, [onDroneInfoUpdate]);

  const testSDKClasses = async () => {
    try {
      console.log('Testing SDK classes...');
      const result = await testSDKClass();
      console.log('SDK Class Test Result:', result);
      setTestResult(JSON.stringify(result, null, 2));
      if (result.success) {
        Alert.alert('Success', `SDK classes loaded successfully!\nVersion: ${result.sdkVersion}`);
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error: any) {
      console.error('SDK Class Test Error:', error);
      Alert.alert('Error', error.message || 'Failed to test SDK classes');
      setTestResult(`Error: ${error.message}`);
    }
  };

  const initializeDJISDK = async () => {
    try {
      console.log('Initializing SDK...');
      const result = await initializeSDK();
      console.log('SDK Init Result:', result);
      setSdkInitialized(result.success);
      setInitResult(JSON.stringify(result, null, 2));
      if (result.success) {
        Alert.alert('Success', 'DJI SDK initialized successfully!');
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error: any) {
      console.error('SDK Init Error:', error);
      Alert.alert('Error', error.message || 'Failed to initialize SDK');
      setInitResult(`Error: ${error.message}`);
    }
  };

  const checkDroneConnection = async () => {
    try {
      const status = await ExpoDjiSdk.isDroneConnected();
      setDroneConnectionStatus(status);
      setDroneConnected(status.connected);
      Alert.alert(
        'Connection Status', 
        `Connected: ${status.connected}\nSDK Registered: ${status.sdkRegistered}\nProduct Connected: ${status.productConnected}\nProduct Type: ${status.productType}`
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to check connection');
    }
  };

  const getDroneInfo = async () => {
    try {
      await ExpoDjiSdk.getDroneInfo();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to get drone info');
    }
  };

  const getDetailedDroneInfoData = async () => {
    try {
      const info = await getDetailedDroneInfo();
      setDetailedDroneInfo(info);
      Alert.alert('Detailed Drone Info', 
        `Product: ${info.productType}\nFirmware: ${info.firmwareVersion}\nSerial: ${info.serialNumber}\nProduct ID: ${info.productId}`
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to get detailed drone info');
    }
  };

  const navigateToSimulator = () => {
    if (!sdkInitialized) {
      Alert.alert('Error', 'Please initialize SDK first');
      return;
    }
    if (!droneConnected) {
      Alert.alert('Error', 'Please connect drone first');
      return;
    }
    navigation.navigate('Simulator');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.container}>
        <Text style={styles.header}>DJI SDK Example</Text>
        
        <Group name="SDK Testing">
          <Button
            title="Test SDK Classes"
            onPress={testSDKClasses}
          />
          {testResult ? (
            <Text style={styles.result}>{testResult}</Text>
          ) : null}
        </Group>

        <Group name="SDK Initialization">
          <Button
            title="Initialize DJI SDK"
            onPress={initializeDJISDK}
            disabled={sdkInitialized}
          />
          <Text style={styles.status}>
            Status: {sdkInitialized ? '🟢 Initialized' : '🔴 Not Initialized'}
          </Text>
          {initResult ? (
            <Text style={styles.result}>{initResult}</Text>
          ) : null}
        </Group>

        <Group name="Drone Connection">
          <Button
            title="Check Drone Connection"
            onPress={checkDroneConnection}
            disabled={!sdkInitialized}
          />
          <Text style={styles.status}>
            Connection: {droneConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </Text>
          {droneConnectionStatus && (
            <View style={styles.statusDetails}>
              <Text style={styles.statusText}>SDK Registered: {droneConnectionStatus.sdkRegistered ? 'Yes' : 'No'}</Text>
              <Text style={styles.statusText}>Product Connected: {droneConnectionStatus.productConnected ? 'Yes' : 'No'}</Text>
              <Text style={styles.statusText}>Product Type: {droneConnectionStatus.productType}</Text>
            </View>
          )}
        </Group>

        <Group name="Drone Information">
          <Button
            title="Get Drone Info"
            onPress={getDroneInfo}
            disabled={!sdkInitialized || !droneConnected}
          />
          {droneInfo ? (
            <View style={styles.infoContainer}>
              <Text style={styles.infoText}>Product ID: {droneInfo.productId || 'N/A'}</Text>
              <Text style={styles.infoText}>Category: {droneInfo.productCategory || 'N/A'}</Text>
              <Text style={styles.infoText}>SDK Version: {droneInfo.sdkVersion || 'N/A'}</Text>
              <Text style={styles.infoText}>Registered: {droneInfo.isRegistered ? 'Yes' : 'No'}</Text>
            </View>
          ) : null}
        </Group>

        <Group name="Detailed Drone Information">
          <Button
            title="Get Detailed Drone Info"
            onPress={getDetailedDroneInfoData}
            disabled={!sdkInitialized || !droneConnected}
          />
          {detailedDroneInfo ? (
            <View style={styles.infoContainer}>
              <Text style={styles.infoText}>Product Type: {detailedDroneInfo.productType}</Text>
              <Text style={styles.infoText}>Firmware Version: {detailedDroneInfo.firmwareVersion}</Text>
              <Text style={styles.infoText}>Serial Number: {detailedDroneInfo.serialNumber}</Text>
              <Text style={styles.infoText}>Product ID: {detailedDroneInfo.productId}</Text>
              <Text style={styles.infoText}>SDK Version: {detailedDroneInfo.sdkVersion}</Text>
              <Text style={styles.infoText}>Connected: {detailedDroneInfo.isConnected ? 'Yes' : 'No'}</Text>
              <Text style={styles.infoText}>Registered: {detailedDroneInfo.isRegistered ? 'Yes' : 'No'}</Text>
            </View>
          ) : null}
        </Group>

        <Group name="🚁 Flight Simulator">
          <Text style={styles.description}>
            Test your drone safely in a virtual environment with real-time telemetry and joystick controls.
          </Text>
          <Button
            title="🎮 Open Simulator"
            onPress={navigateToSimulator}
            disabled={!sdkInitialized || !droneConnected}
          />
          {(!sdkInitialized || !droneConnected) && (
            <Text style={styles.warningText}>
              ⚠️ Initialize SDK and connect drone to access simulator
            </Text>
          )}
        </Group>
      </ScrollView>
    </SafeAreaView>
  );
};

function Group(props: { name: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupHeader}>{props.name}</Text>
      {props.children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    fontSize: 30,
    margin: 20,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  groupHeader: {
    fontSize: 20,
    marginBottom: 20,
    fontWeight: 'bold',
  },
  group: {
    margin: 20,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
  },
  container: {
    flex: 1,
    backgroundColor: '#eee',
    paddingBottom: 50,
  },
  status: {
    fontSize: 16,
    marginTop: 10,
    fontWeight: 'bold',
  },
  result: {
    fontSize: 12,
    marginTop: 10,
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 5,
    fontFamily: 'monospace',
  },
  infoContainer: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 5,
  },
  infoText: {
    fontSize: 14,
    marginBottom: 5,
  },
  statusDetails: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
  },
  statusText: {
    fontSize: 14,
    marginBottom: 3,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    textAlign: 'center',
    lineHeight: 20,
  },
  warningText: {
    fontSize: 12,
    color: '#ff6b6b',
    marginTop: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});