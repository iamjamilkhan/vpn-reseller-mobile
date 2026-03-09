import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, SafeAreaView, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Shield, ShieldOff, Globe, Signal, LogOut, ChevronDown, Activity, MapPin } from 'lucide-react-native';
import WireGuardVpnModule from 'react-native-wireguard-vpn';

export default function HomeScreen({ navigation }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedServer, setSelectedServer] = useState({ name: 'EU-West (Frankfurt)', ip: '192.168.1.1', load: '45%' });
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [codeKey, setCodeKey] = useState('');
  const [serversList, setServersList] = useState([
    { id: 1, name: 'EU-West (Frankfurt)', location: 'Germany', load: '45%', status: 'active' },
    { id: 2, name: 'US-East (New York)', location: 'USA', load: '82%', status: 'active' },
    { id: 3, name: 'AP-South (Mumbai)', location: 'India', load: '12%', status: 'active' },
  ]);

  useEffect(() => {
    const loadData = async () => {
      const savedKey = await SecureStore.getItemAsync('vpn_code_key');
      if (savedKey) setCodeKey(savedKey);

      try {
        const savedCustomConfigsStr = await SecureStore.getItemAsync('generic_wg_configs');
        if (savedCustomConfigsStr) {
           const customConfigs = JSON.parse(savedCustomConfigsStr);
           if (customConfigs.length > 0) {
              setServersList(prev => [...customConfigs, ...prev]);
              // Auto-select the first custom config if available
              setSelectedServer(customConfigs[0]);
           }
        }
      } catch (err) {
        console.log('Failed to load custom configs', err);
      }

      try {
        await WireGuardVpnModule.initialize();
        const status = await WireGuardVpnModule.getStatus();
        if (status.isConnected) {
          setIsConnected(true);
        }
      } catch (err) {
        console.log('WireGuard init failed (Normal if running in Expo Go):', err);
      }
    };
    loadData();
  }, []);

  const handleConnectToggle = async () => {
    if (isConnected) {
      setIsConnected(false);
      try {
        await WireGuardVpnModule.disconnect();
      } catch (e) {
        console.log("Disconnect error:", e);
      }
    } else {
      setIsConnecting(true);
      
      try {
        // If the server has a pre-parsed custom config, use it directly.
        // Otherwise fallback to the placeholder dummy config logic.
        const config = selectedServer.config || {
          privateKey: 'YOUR_PRIVATE_KEY',
          publicKey: 'SERVER_PUBLIC_KEY',
          serverAddress: selectedServer.ip || '192.168.1.1',
          serverPort: 51820,
          allowedIPs: ['0.0.0.0/0'],
          dns: ['1.1.1.1'],
          mtu: 1420
        };

        await WireGuardVpnModule.connect(config);
        setIsConnected(true);
      } catch (err) {
        console.error('Connection failed:', err);
        const errorMsg = err?.message || String(err);
        if (errorMsg.includes("undefined is not an object") || errorMsg.includes("null is not an object")) {
           alert('Native VPN Module missing. Are you running the Custom Dev Client build?');
        } else {
           alert(`VPN Connection Failed: ${errorMsg}\n\nMake sure your configuration keys are valid Base64.`);
        }
      } finally {
        setIsConnecting(false);
      }
    }
  };

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync('vpn_code_key');
    await SecureStore.deleteItemAsync('vpn_configs');
    // Real App: Make API call to backend /api/client/revoke if logout means revocation
    // Or just clear local data to switch keys
    navigation.replace('Auth');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Nexus<Text style={{color: '#6366f1'}}>VPN</Text></Text>
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: isConnected ? '#10b981' : '#ef4444' }]} />
            <Text style={styles.statusText}>{isConnected ? 'SECURE' : 'UNPROTECTED'}</Text>
          </View>
        </View>
        
        <TouchableOpacity style={styles.iconButton} onPress={handleLogout}>
          <LogOut color="#a1a1aa" size={20} />
        </TouchableOpacity>
      </View>

      <View style={styles.mainContent}>
        {/* The Giant Connect Button */}
        <View style={styles.connectWrapper}>
          <View style={[styles.glowRing, isConnected && styles.glowRingActive, isConnecting && styles.glowRingConnecting]} />
          
          <TouchableOpacity 
            style={[
              styles.connectButton, 
              isConnected && styles.connectButtonActive,
              isConnecting && styles.connectButtonConnecting
            ]} 
            onPress={handleConnectToggle}
            activeOpacity={0.8}
            disabled={isConnecting}
          >
            {isConnected ? (
              <Shield color="#FFFFFF" size={48} />
            ) : (
              <ShieldOff color="#FFFFFF" size={48} />
            )}
            <Text style={styles.connectText}>
              {isConnecting ? 'CONNECTING...' : isConnected ? 'CONNECTED' : 'TAP TO CONNECT'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Selected Location Card */}
        <TouchableOpacity 
          style={styles.locationCard} 
          onPress={() => !isConnected && setShowLocationModal(true)}
          disabled={isConnected || isConnecting}
        >
          <View style={styles.locationRow}>
            <View style={styles.locationIcon}>
              <Globe color="#a855f7" size={20} />
            </View>
            <View style={styles.locationInfo}>
              <Text style={styles.locationLabel}>Selected Region</Text>
              <Text style={styles.locationName}>{selectedServer.name}</Text>
            </View>
            <ChevronDown color={isConnected ? '#333' : '#a1a1aa'} size={24} />
          </View>
        </TouchableOpacity>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
             <Activity color="#a1a1aa" size={16} style={{marginBottom: 8}} />
             <Text style={styles.statValue}>{isConnected ? '12.4' : '0.0'}</Text>
             <Text style={styles.statLabel}>MB/s Download</Text>
          </View>
          <View style={styles.statBox}>
             <Signal color="#a1a1aa" size={16} style={{marginBottom: 8}} />
             <Text style={styles.statValue}>{isConnected ? '24' : '--'}</Text>
             <Text style={styles.statLabel}>Ping (ms)</Text>
          </View>
        </View>
      </View>

      {/* Subscription Info Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerKey}>Key: {codeKey || '••••-••••-••••'}</Text>
        <Text style={styles.footerExpire}>Expires in 29 days</Text>
      </View>

      {/* Location Selector Modal */}
      <Modal visible={showLocationModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Region</Text>
              <TouchableOpacity onPress={() => setShowLocationModal(false)}>
                <Text style={styles.modalClose}>Done</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.serverList}>
              {serversList.map(server => (
                <TouchableOpacity 
                  key={server.id} 
                  style={[styles.serverItem, selectedServer.name === server.name && styles.serverItemActive]}
                  onPress={() => {
                    setSelectedServer(server);
                    setShowLocationModal(false);
                  }}
                >
                  <View style={styles.serverItemRow}>
                    <MapPin color={selectedServer.name === server.name ? '#6366f1' : '#a1a1aa'} size={20} />
                    <View style={styles.serverItemInfo}>
                      <Text style={styles.serverName}>{server.name} {server.isCustom && '(Custom)'}</Text>
                      <Text style={styles.serverLocation}>{server.location}</Text>
                    </View>
                  </View>
                  <View style={[styles.loadIndicator, { backgroundColor: parseInt(server.load) > 80 ? '#ef4444' : '#10b981' }]} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    color: '#a1a1aa',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainContent: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  connectWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 280,
    marginBottom: 40,
  },
  glowRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  glowRingActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  glowRingConnecting: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  connectButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 2,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  connectButtonActive: {
    backgroundColor: '#10b981',
    borderColor: '#059669',
    shadowColor: '#10b981',
  },
  connectButtonConnecting: {
    borderColor: '#f59e0b',
    shadowColor: '#f59e0b',
  },
  connectText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 12,
  },
  locationCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationInfo: {
    flex: 1,
    marginLeft: 16,
  },
  locationLabel: {
    color: '#a1a1aa',
    fontSize: 12,
  },
  locationName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
  },
  statValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    color: '#a1a1aa',
    fontSize: 12,
    marginTop: 4,
  },
  footer: {
    padding: 24,
    alignItems: 'center',
  },
  footerKey: {
    color: '#a1a1aa',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 13,
  },
  footerExpire: {
    color: '#10b981',
    fontSize: 12,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#18181b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: '60%',
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  modalClose: {
    color: '#6366f1',
    fontSize: 16,
    fontWeight: '600',
  },
  serverList: {
    flex: 1,
  },
  serverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  serverItemActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginHorizontal: -12,
    borderBottomWidth: 0,
  },
  serverItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serverItemInfo: {
    marginLeft: 16,
  },
  serverName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  serverLocation: {
    color: '#a1a1aa',
    fontSize: 13,
    marginTop: 2,
  },
  loadIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  }
});
