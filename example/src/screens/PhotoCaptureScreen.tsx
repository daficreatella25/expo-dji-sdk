import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useEvent } from 'expo';
import ExpoDjiSdk, {
  setCameraMode,
  shootPhoto,
  startPhotoSession,
  stopPhotoSession,
  getActivePhotoSession,
  downloadSessionPhotos,
  type ActiveSession,
} from 'expo-dji-sdk';

/**
 * Workflow:
 *   1. (Optional) Set camera to PHOTO mode — required if currently in video mode.
 *   2. Pick a sessionId (e.g. mission UUID or a manual label).
 *   3. Start session → native timer fires shutter every N ms; photos save to drone SD.
 *   4. Fly the mission. shotCount updates live via onShootPhotoResult events.
 *   5. Land, stop session.
 *   6. Tap "Download photos" → MediaManager pulls all photos from the session window to phone.
 *   7. Browse them in the Gallery tab.
 *
 * Default interval is 2000ms (Mini 3 minimum reliable cadence). Hard floor in native is 1500ms.
 */
export default function PhotoCaptureScreen({ navigation }: any) {
  const [sessionIdInput, setSessionIdInput] = useState(
    () => `manual-${new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '')}`,
  );
  const [intervalMs, setIntervalMs] = useState('2000');
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [lastResult, setLastResult] = useState<string>('');

  const shootEvent = useEvent(ExpoDjiSdk, 'onShootPhotoResult');
  const downloadEvent = useEvent(ExpoDjiSdk, 'onPhotoDownloadProgress');

  // Refresh active session on mount in case the timer is still running from a prior screen.
  useEffect(() => {
    getActivePhotoSession().then(setActive).catch(() => {});
  }, []);

  // Mirror native shotCount into local state for live updates.
  useEffect(() => {
    if (!shootEvent) return;
    setActive(prev => prev ? { ...prev, shotCount: shootEvent.shotIndex } : prev);
  }, [shootEvent]);

  const downloadProgressText = useMemo(() => {
    if (!downloadEvent) return '';
    const { fileName, downloaded, total, finished } = downloadEvent as any;
    const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;
    return finished ? `${fileName} ✓` : `${fileName} ${pct}%`;
  }, [downloadEvent]);

  const handleSetPhotoMode = async () => {
    try {
      await setCameraMode('PHOTO');
      Alert.alert('Camera mode', 'Switched to PHOTO mode.');
    } catch (e: any) {
      Alert.alert('Failed', e?.message ?? String(e));
    }
  };

  const handleSingleShot = async () => {
    try {
      await shootPhoto();
      Alert.alert('Shutter', 'Triggered.');
    } catch (e: any) {
      Alert.alert('Failed', e?.message ?? String(e));
    }
  };

  const handleStart = async () => {
    const ms = parseInt(intervalMs, 10);
    if (Number.isNaN(ms) || ms < 1500) {
      Alert.alert('Invalid interval', 'Minimum interval is 1500ms (Mini 3 single-shot cycle).');
      return;
    }
    if (!sessionIdInput.trim()) {
      Alert.alert('Invalid sessionId', 'Pick a unique session ID.');
      return;
    }
    try {
      const res = await startPhotoSession(sessionIdInput.trim(), ms);
      setActive({ sessionId: sessionIdInput.trim(), shotCount: 0, startedAt: Date.now(), intervalMs: ms });
      setLastResult(`Started session ${res.sessionId}`);
    } catch (e: any) {
      Alert.alert('Start failed', e?.message ?? String(e));
    }
  };

  const handleStop = async () => {
    try {
      const res = await stopPhotoSession();
      setActive(null);
      if (res.success) {
        setLastResult(`Stopped session ${res.sessionId} — ${res.shotCount} shots triggered.`);
      }
    } catch (e: any) {
      Alert.alert('Stop failed', e?.message ?? String(e));
    }
  };

  const handleDownload = async () => {
    const sessionId = active?.sessionId ?? sessionIdInput.trim();
    if (!sessionId) {
      Alert.alert('No session', 'Pick a session to download.');
      return;
    }
    if (active) {
      Alert.alert('Session still active', 'Stop the session first — downloading pauses the live video stream.');
      return;
    }
    setDownloading(true);
    setLastResult('');
    try {
      const res = await downloadSessionPhotos(sessionId);
      setLastResult(`Downloaded ${res.downloaded} new file(s), skipped ${res.skipped} already-on-phone.`);
    } catch (e: any) {
      Alert.alert('Download failed', e?.message ?? String(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Camera mode</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.btn} onPress={handleSetPhotoMode}>
            <Text style={styles.btnText}>Set PHOTO mode</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={handleSingleShot}>
            <Text style={styles.btnText}>📸 Single shot</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>New session</Text>
        <Text style={styles.label}>Session ID</Text>
        <TextInput
          style={styles.input}
          value={sessionIdInput}
          onChangeText={setSessionIdInput}
          editable={!active}
          autoCapitalize="none"
        />
        <Text style={styles.label}>Interval (ms)</Text>
        <TextInput
          style={styles.input}
          value={intervalMs}
          onChangeText={setIntervalMs}
          keyboardType="number-pad"
          editable={!active}
        />
        <Text style={styles.hint}>Minimum 1500ms. Mini 3 reliably caps at one shot every ~2s.</Text>

        {!active ? (
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleStart}>
            <Text style={styles.btnText}>▶ Start session</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleStop}>
            <Text style={styles.btnText}>■ Stop session</Text>
          </TouchableOpacity>
        )}
      </View>

      {active && (
        <View style={[styles.section, styles.activeCard]}>
          <Text style={styles.sectionTitle}>Active session</Text>
          <Text style={styles.activeRow}>ID: <Text style={styles.mono}>{active.sessionId}</Text></Text>
          <Text style={styles.activeRow}>Interval: {active.intervalMs}ms</Text>
          <Text style={styles.bigCount}>{active.shotCount}</Text>
          <Text style={styles.shotsLabel}>shots triggered</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Post-flight download</Text>
        <Text style={styles.hint}>
          Land the drone, stop the session, then download. Live video pauses during download.
        </Text>
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary, downloading && { opacity: 0.5 }]}
          onPress={handleDownload}
          disabled={downloading}
        >
          <Text style={styles.btnText}>
            {downloading ? '⬇ Downloading…' : '⬇ Download session photos'}
          </Text>
        </TouchableOpacity>
        {downloadProgressText !== '' && <Text style={styles.hint}>{downloadProgressText}</Text>}
        {lastResult !== '' && <Text style={styles.result}>{lastResult}</Text>}
      </View>

      <TouchableOpacity
        style={[styles.btn, styles.btnSecondary, { marginTop: 8 }]}
        onPress={() => navigation.navigate('Gallery')}
      >
        <Text style={styles.btnText}>🖼 Open gallery</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1729' },
  content: { padding: 16, paddingBottom: 48 },
  section: { backgroundColor: '#1A2336', padding: 16, borderRadius: 12, marginBottom: 16 },
  sectionTitle: { color: '#A3D6F4', fontSize: 14, fontWeight: '600', marginBottom: 12, letterSpacing: 0.4 },
  label: { color: '#7F8B9E', fontSize: 12, marginTop: 8, marginBottom: 4 },
  input: {
    backgroundColor: '#0F1729', color: '#fff', paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 8, borderWidth: 1, borderColor: '#2A3550', fontSize: 14, fontFamily: 'monospace',
  },
  hint: { color: '#7F8B9E', fontSize: 11, marginTop: 8, lineHeight: 16 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnPrimary: { backgroundColor: '#40DEAC' },
  btnSecondary: { backgroundColor: '#A3D6F4' },
  btnDanger: { backgroundColor: '#FF6B6B' },
  btnText: { color: '#0F1729', fontWeight: '700', fontSize: 14 },
  activeCard: { borderWidth: 1, borderColor: '#40DEAC', alignItems: 'center' },
  activeRow: { color: '#fff', fontSize: 12, marginBottom: 4 },
  mono: { fontFamily: 'monospace' },
  bigCount: { color: '#40DEAC', fontSize: 48, fontWeight: '700', marginTop: 12 },
  shotsLabel: { color: '#7F8B9E', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  result: { color: '#40DEAC', fontSize: 12, marginTop: 12 },
});
