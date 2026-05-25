import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';
import ExpoDjiSdk, {
  listCaptureSessions,
  listCapturesInSession,
  downloadSessionPhotos,
  deleteCapture,
  type CaptureSession,
  type CapturedPhoto,
} from 'expo-dji-sdk';
import { useEvent } from 'expo';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLS = 3;
const THUMB_SIZE = Math.floor((SCREEN_WIDTH - 16 * 2 - 8 * (COLS - 1)) / COLS);

export default function GalleryScreen() {
  const [sessions, setSessions] = useState<CaptureSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<CaptureSession | null>(null);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [viewerPhoto, setViewerPhoto] = useState<CapturedPhoto | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string>('');

  const dlEvent = useEvent(ExpoDjiSdk, 'onPhotoDownloadProgress');
  useEffect(() => {
    if (!dlEvent) return;
    const { fileName, downloaded, total, finished } = dlEvent as any;
    const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;
    setDownloadProgress(finished ? `${fileName} ✓` : `${fileName} ${pct}%`);
  }, [dlEvent]);

  const refreshSessions = useCallback(async () => {
    setRefreshing(true);
    try {
      const list = await listCaptureSessions();
      setSessions(list);
    } catch (e: any) {
      Alert.alert('Failed to list sessions', e?.message ?? String(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { refreshSessions(); }, [refreshSessions]);

  const loadPhotos = useCallback(async (sessionId: string) => {
    try {
      const list = await listCapturesInSession(sessionId);
      setPhotos(list);
    } catch (e: any) {
      Alert.alert('Failed to load photos', e?.message ?? String(e));
    }
  }, []);

  const openSession = async (session: CaptureSession) => {
    setSelectedSession(session);
    setDownloadProgress('');
    loadPhotos(session.sessionId);
  };

  // Pull photos for this session straight from the drone SD card, then refresh
  // the grid. Requires the drone connected; pauses live video during the pull.
  const handleDownloadFromDrone = async (sessionId: string) => {
    setDownloading(true);
    setDownloadProgress('Scanning drone SD…');
    try {
      const res = await downloadSessionPhotos(sessionId);
      await loadPhotos(sessionId);
      refreshSessions();
      setDownloadProgress('');
      Alert.alert(
        'Download complete',
        `Downloaded ${res.downloaded} new photo(s), skipped ${res.skipped} already on phone.`,
      );
    } catch (e: any) {
      setDownloadProgress('');
      Alert.alert(
        'Download failed',
        `${e?.message ?? e}\n\nMake sure the drone is connected (downloads pull from the drone SD card).`,
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async (photo: CapturedPhoto) => {
    Alert.alert('Delete photo', `Delete ${photo.fileName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCapture(photo.path);
            setPhotos(prev => prev.filter(p => p.path !== photo.path));
            setViewerPhoto(null);
            refreshSessions();
          } catch (e: any) {
            Alert.alert('Failed', e?.message ?? String(e));
          }
        },
      },
    ]);
  };

  // ----- Session list view
  if (!selectedSession) {
    return (
      <View style={styles.container}>
        <FlatList
          data={sessions}
          keyExtractor={item => item.sessionId}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshSessions} tintColor="#A3D6F4" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No capture sessions yet</Text>
              <Text style={styles.emptyHint}>Start a session in the Photo Capture screen, fly your mission, then download photos.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.sessionRow} onPress={() => openSession(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sessionTitle}>{item.sessionId}</Text>
                <Text style={styles.sessionMeta}>
                  {new Date(item.startedAt).toLocaleString()} · {item.shotCount} triggered · {item.downloadedCount} downloaded
                </Text>
                {item.totalBytes > 0 && (
                  <Text style={styles.sessionMeta}>
                    {(item.totalBytes / (1024 * 1024)).toFixed(1)} MB on phone
                  </Text>
                )}
              </View>
              {/* Quick download straight from the list (drone must be connected) */}
              <TouchableOpacity
                style={[styles.rowDlButton, downloading && { opacity: 0.4 }]}
                disabled={downloading}
                onPress={() => { setSelectedSession(item); handleDownloadFromDrone(item.sessionId); }}
              >
                <Text style={styles.rowDlButtonText}>⬇</Text>
              </TouchableOpacity>
              <Text style={styles.chev}>›</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    );
  }

  // ----- Photo grid view for a session
  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => { setSelectedSession(null); setPhotos([]); }}>
          <Text style={styles.back}>← Sessions</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{selectedSession.sessionId}</Text>
        <Text style={styles.headerCount}>{photos.length}</Text>
      </View>

      {/* Download-from-drone bar */}
      <View style={styles.dlBar}>
        <TouchableOpacity
          style={[styles.dlButton, downloading && { opacity: 0.5 }]}
          onPress={() => handleDownloadFromDrone(selectedSession.sessionId)}
          disabled={downloading}
        >
          <Text style={styles.dlButtonText}>
            {downloading ? '⬇ Downloading…' : '⬇ Download from drone'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.dlProgress} numberOfLines={1}>
          {downloadProgress || `${selectedSession.shotCount} shot(s) triggered · ${photos.length} on phone`}
        </Text>
      </View>
      <FlatList
        data={photos}
        keyExtractor={item => item.path}
        numColumns={COLS}
        contentContainerStyle={{ padding: 16 }}
        columnWrapperStyle={{ gap: 8, marginBottom: 8 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No photos on the phone for this session yet</Text>
            <Text style={styles.emptyHint}>Tap "⬇ Download from drone" above to pull them off the drone SD card (drone must be connected).</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => setViewerPhoto(item)} activeOpacity={0.7}>
            <Image source={{ uri: item.uri }} style={styles.thumb} />
          </TouchableOpacity>
        )}
      />

      <Modal visible={!!viewerPhoto} transparent animationType="fade" onRequestClose={() => setViewerPhoto(null)}>
        <View style={styles.viewerBg}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerPhoto(null)}>
            <Text style={styles.viewerCloseText}>✕</Text>
          </TouchableOpacity>
          {viewerPhoto && (
            <>
              <Image source={{ uri: viewerPhoto.uri }} style={styles.viewerImage} resizeMode="contain" />
              <View style={styles.viewerInfo}>
                <Text style={styles.viewerFile}>{viewerPhoto.fileName}</Text>
                <Text style={styles.viewerSize}>{(viewerPhoto.sizeBytes / (1024 * 1024)).toFixed(2)} MB</Text>
              </View>
              <TouchableOpacity style={styles.viewerDelete} onPress={() => handleDelete(viewerPhoto)}>
                <Text style={styles.viewerDeleteText}>Delete</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1729' },
  empty: { padding: 32, alignItems: 'center' },
  emptyTitle: { color: '#fff', fontSize: 14, marginBottom: 8 },
  emptyHint: { color: '#7F8B9E', fontSize: 12, textAlign: 'center', lineHeight: 16 },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1A2336', padding: 14, borderRadius: 10, marginBottom: 10,
  },
  sessionTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  sessionMeta: { color: '#7F8B9E', fontSize: 11, marginTop: 2 },
  chev: { color: '#A3D6F4', fontSize: 22, marginLeft: 8 },
  rowDlButton: {
    backgroundColor: '#A3D6F4', borderRadius: 8,
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  rowDlButtonText: { color: '#0F1729', fontSize: 18, fontWeight: '700' },
  dlBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, gap: 12,
    borderBottomWidth: 1, borderBottomColor: '#1A2336',
  },
  dlButton: { backgroundColor: '#40DEAC', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  dlButtonText: { color: '#0F1729', fontWeight: '700', fontSize: 13 },
  dlProgress: { color: '#7F8B9E', fontSize: 11, flex: 1 },
  headerBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1A2336',
  },
  back: { color: '#A3D6F4', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#fff', flex: 1, textAlign: 'center', fontSize: 14, fontFamily: 'monospace' },
  headerCount: { color: '#7F8B9E', fontSize: 12 },
  thumb: { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 6, backgroundColor: '#1A2336' },
  viewerBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  viewerClose: { position: 'absolute', top: 48, right: 24, padding: 8, zIndex: 1 },
  viewerCloseText: { color: '#fff', fontSize: 24 },
  viewerImage: { width: '100%', height: '70%' },
  viewerInfo: { position: 'absolute', bottom: 90, left: 0, right: 0, alignItems: 'center' },
  viewerFile: { color: '#fff', fontSize: 13, fontFamily: 'monospace' },
  viewerSize: { color: '#7F8B9E', fontSize: 11, marginTop: 4 },
  viewerDelete: {
    position: 'absolute', bottom: 32, alignSelf: 'center',
    backgroundColor: '#FF6B6B', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8,
  },
  viewerDeleteText: { color: '#0F1729', fontWeight: '700' },
});
