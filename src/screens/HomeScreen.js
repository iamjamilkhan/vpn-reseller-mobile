import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, SafeAreaView, Platform, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { Shield, ShieldOff, Globe, Signal, LogOut, ChevronDown, Activity, MapPin, Search } from 'lucide-react-native';
import WireGuardVpnModule from 'react-native-wireguard-vpn';

const { width } = Dimensions.get('window');

const COUNTRIES = [
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
];

const getFlag = (code) => {
  const country = COUNTRIES.find(c => c.code === code);
  return country ? country.flag : null;
};

const getLocationName = (code) => {
  const country = COUNTRIES.find(c => c.code === code);
  return country ? country.name : (code || 'Global');
};

const getLoadConfig = (loadVal) => {
  let load = parseInt(loadVal, 10);
  if (isNaN(load)) load = 0;
  
  if (load <= 30) return { text: 'Low', color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.15)' };
  if (load <= 70) return { text: 'Med', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.15)' };
  if (load <= 90) return { text: 'High', color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.15)' };
  return { text: 'Full', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.15)' };
};

export default function HomeScreen({ navigation }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedServer, setSelectedServer] = useState({ name: 'Loading Servers...', location: '...', ip: '' });
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [codeKey, setCodeKey] = useState('');
  const [serversList, setServersList] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      const savedKey = await SecureStore.getItemAsync('vpn_code_key');
      if (savedKey) setCodeKey(savedKey);

      try {
        let allServers = [];
        
        const vpnConfigsStr = await SecureStore.getItemAsync('vpn_configs');
        if (vpnConfigsStr) {
          const vpnConfigs = JSON.parse(vpnConfigsStr);
          allServers = [...allServers, ...vpnConfigs];
        }

        const savedCustomConfigsStr = await SecureStore.getItemAsync('generic_wg_configs');
        if (savedCustomConfigsStr) {
           const customConfigs = JSON.parse(savedCustomConfigsStr);
           allServers = [...allServers, ...customConfigs];
        }

        if (allServers.length > 0) {
          setServersList(allServers);
          setSelectedServer(allServers[0]);
        }
      } catch (err) {
        console.log('Failed to load servers', err);
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
        let wgObj = selectedServer.config;
        
        // If we have a raw Wireguard config string (from DB/Dashboard), parse it
        if (selectedServer.configStr) {
          wgObj = {
            privateKey: '', publicKey: '', serverAddress: '', serverPort: 51820,
            addresses: ['10.0.0.2/32'], allowedIPs: ['0.0.0.0/0'], dns: ['1.1.1.1'], mtu: 1420
          };
          
          selectedServer.configStr.split('\n').forEach(line => {
            const [key, ...valueParts] = line.split('=');
            if (!key || valueParts.length === 0) return;
            const val = valueParts.join('=').trim();
            const k = key.trim().toLowerCase();
            if (k === 'privatekey') wgObj.privateKey = val;
            if (k === 'publickey') wgObj.publicKey = val;
            if (k === 'presharedkey') wgObj.presharedKey = val;
            if (k === 'endpoint') {
              const parts = val.split(':');
              wgObj.serverAddress = parts[0];
              if (parts[1]) wgObj.serverPort = parseInt(parts[1], 10);
            }
            if (k === 'allowedips') wgObj.allowedIPs = val.split(',').map(s => s.trim());
            if (k === 'address') wgObj.addresses = val.split(',').map(s => s.trim());
            if (k === 'dns') wgObj.dns = val.split(',').map(s => s.trim());
            if (k === 'mtu') wgObj.mtu = parseInt(val, 10);
            if (k === 'persistentkeepalive') wgObj.persistentKeepalive = parseInt(val, 10);
          });
        }
        
        const finalConfig = {
          name: 'NexusVPN',
          privateKey: wgObj?.privateKey || '',
          publicKey: wgObj?.publicKey || '',
          presharedKey: wgObj?.presharedKey || '',
          serverAddress: wgObj?.serverAddress || selectedServer.ip || '',
          serverPort: wgObj?.serverPort || 51820,
          addresses: wgObj?.addresses || ['10.0.0.2/32'],
          allowedIPs: wgObj?.allowedIPs || ['0.0.0.0/0'],
          dns: wgObj?.dns || ['1.1.1.1', '8.8.8.8'],
          mtu: wgObj?.mtu || 1280,
          persistentKeepalive: wgObj?.persistentKeepalive || 25
        };

        if (!finalConfig.privateKey || (!finalConfig.publicKey && !finalConfig.presharedKey)) {
          throw new Error('Incomplete VPN configuration. Please try re-activating your key.');
        }

        await WireGuardVpnModule.connect(finalConfig);
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
    navigation.replace('Auth');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Dynamic Background Glow */}
      <View style={[styles.bgGlow, isConnected && styles.bgGlowActive]} />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Nexus<Text style={{color: isConnected ? '#10b981' : '#3b82f6'}}>VPN</Text></Text>
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: isConnected ? '#10b981' : '#a1a1aa' }, isConnecting && {backgroundColor: '#f59e0b'}]} />
            <Text style={[styles.statusText, isConnected && {color: '#10b981'}]}>
              {isConnecting ? 'CONNECTING...' : isConnected ? 'PROTECTED' : 'UNPROTECTED'}
            </Text>
          </View>
        </View>
        
        <TouchableOpacity style={styles.iconButton} onPress={handleLogout}>
          <LogOut color="#fff" size={20} />
        </TouchableOpacity>
      </View>

      <View style={styles.mainContent}>
        
        {/* Futuristic Connect Node */}
        <View style={styles.nodeWrapper}>
          {/* Animated pulsing rings could go here. For now, static glow rings */}
          <View style={[styles.pulseRing, isConnected && styles.pulseRingActive]} />
          <View style={[styles.pulseRingInner, isConnected && styles.pulseRingInnerActive]} />
          
          <TouchableOpacity 
            style={[
              styles.connectNode, 
              isConnected && styles.connectNodeActive,
              isConnecting && styles.connectNodeConnecting
            ]} 
            onPress={handleConnectToggle}
            activeOpacity={0.9}
            disabled={isConnecting}
          >
            {isConnected ? (
              <Shield color="#fff" size={48} strokeWidth={1.5} />
            ) : (
              <ShieldOff color="#a1a1aa" size={48} strokeWidth={1.5} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.glassPanel}>
          {/* Location Selector */}
          <TouchableOpacity 
            style={styles.locationSelector} 
            onPress={() => !isConnected && setShowLocationModal(true)}
            disabled={isConnected || isConnecting || serversList.length === 0}
          >
            <View style={styles.locationLeft}>
              <View style={[styles.locationIconWrapper, isConnected && {backgroundColor: 'rgba(16, 185, 129, 0.15)'}]}>
                {selectedServer?.location && getFlag(selectedServer.location) ? (
                   <Text style={{fontSize: 24, lineHeight: 28}}>{getFlag(selectedServer.location)}</Text>
                ) : (
                   <Globe color={isConnected ? '#10b981' : '#3b82f6'} size={24} />
                )}
              </View>
              <View>
                <Text style={styles.locationLabel}>Current Server</Text>
                <Text style={styles.locationName}>{selectedServer?.name || 'No Servers Found'}</Text>
              </View>
            </View>
            <ChevronDown color={isConnected ? "rgba(255,255,255,0.2)" : "#fff"} size={20} />
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Activity Stats */}
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <View style={styles.statHeader}>
                <Activity color="#a1a1aa" size={16} />
                <Text style={styles.statLabel}>Down</Text>
              </View>
              <Text style={styles.statValue}>{isConnected ? '34.2' : '0.0'} <Text style={styles.statUnit}>MB/s</Text></Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <View style={styles.statHeader}>
                <Activity color="#a1a1aa" size={16} />
                <Text style={styles.statLabel}>Up</Text>
              </View>
              <Text style={styles.statValue}>{isConnected ? '12.8' : '0.0'} <Text style={styles.statUnit}>MB/s</Text></Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <View style={styles.statHeader}>
                <Signal color="#a1a1aa" size={16} />
                <Text style={styles.statLabel}>Ping</Text>
              </View>
              <Text style={styles.statValue}>{isConnected ? '18' : '--'} <Text style={styles.statUnit}>ms</Text></Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.keyBadge}>
          <Text style={styles.keyLabel}>Key ID:</Text>
          <Text style={styles.keyValue}>{codeKey ? `${codeKey.substring(0, 8)}...` : 'DEMO-MODE'}</Text>
        </View>
      </View>

      {/* Modern Bottom Sheet Modal */}
      <Modal visible={showLocationModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Server</Text>
            
            <View style={styles.searchBar}>
              <Search color="#a1a1aa" size={20} />
              <Text style={styles.searchPlaceholder}>Search regions...</Text>
            </View>

            <ScrollView style={styles.serverList} showsVerticalScrollIndicator={false}>
              {serversList.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: '#a1a1aa', textAlign: 'center' }}>No servers available. Please ensure your access key is active.</Text>
                </View>
              ) : (
                serversList.map(server => (
                  <TouchableOpacity 
                    key={server.id} 
                    style={[styles.serverItem, selectedServer?.name === server.name && styles.serverItemActive]}
                    onPress={() => {
                      setSelectedServer(server);
                      setShowLocationModal(false);
                    }}
                  >
                    <View style={styles.serverItemLeft}>
                      <View style={[styles.serverIcon, selectedServer?.name === server.name && styles.serverIconActive]}>
                         {server?.location && getFlag(server.location) ? (
                            <Text style={{fontSize: 24, lineHeight: 28}}>{getFlag(server.location)}</Text>
                         ) : (
                            <MapPin color={selectedServer?.name === server.name ? '#10b981' : '#a1a1aa'} size={20} />
                         )}
                      </View>
                      <View>
                        <Text style={[styles.serverNameText, selectedServer?.name === server.name && {color: '#fff'}]}>
                          {server.name} {server.isCustom && '(Custom)'}
                        </Text>
                        <Text style={styles.serverLocationText}>{getLocationName(server.location)}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.serverItemRight}>
                      {(() => {
                        const loadConf = getLoadConfig(server.load);
                        return (
                          <View style={[styles.loadPill, { backgroundColor: loadConf.bgColor }]}>
                            <Text style={[styles.loadText, { color: loadConf.color }]}>{loadConf.text}</Text>
                          </View>
                        );
                      })()}
                      <View style={[styles.radioCircle, selectedServer?.name === server.name && styles.radioCircleActive]}>
                         {selectedServer?.name === server.name && <View style={styles.radioDot} />}
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowLocationModal(false)}>
               <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05050A',
  },
  bgGlow: {
    position: 'absolute',
    top: -100,
    width: width * 1.5,
    height: width * 1.5,
    borderRadius: width,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    alignSelf: 'center',
    transform: [{ scaleY: 0.5 }],
  },
  bgGlowActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 40 : 16,
    paddingBottom: 16,
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'column',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  statusText: {
    color: '#a1a1aa',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainContent: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
    paddingBottom: 40,
  },
  nodeWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  pulseRing: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.01)',
  },
  pulseRingActive: {
    borderColor: 'rgba(16, 185, 129, 0.2)',
    backgroundColor: 'rgba(16, 185, 129, 0.02)',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 40,
  },
  pulseRingInner: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  pulseRingInnerActive: {
    borderColor: 'rgba(16, 185, 129, 0.4)',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  connectNode: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#12121A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
  },
  connectNodeActive: {
    backgroundColor: '#10b981',
    borderColor: '#34d399',
    shadowColor: '#10b981',
    shadowOpacity: 0.6,
    shadowRadius: 40,
  },
  connectNodeConnecting: {
    backgroundColor: '#0F0F16',
    borderColor: '#f59e0b',
    shadowColor: '#f59e0b',
    shadowOpacity: 0.4,
  },
  glassPanel: {
    backgroundColor: 'rgba(20, 20, 28, 0.6)',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  locationSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
  },
  locationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  locationLabel: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  locationName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 24,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 24,
  },
  statItem: {
    flex: 1,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statLabel: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 6,
  },
  statValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  statUnit: {
    fontSize: 12,
    color: '#a1a1aa',
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 16,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 0 : 24,
  },
  keyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  keyLabel: {
    color: '#a1a1aa',
    fontSize: 12,
    marginRight: 6,
  },
  keyValue: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#12121A',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    height: '75%',
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderBottomWidth: 0,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 24,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  searchPlaceholder: {
    color: '#a1a1aa',
    marginLeft: 12,
    fontSize: 16,
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
    borderBottomColor: 'transparent',
  },
  serverItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serverIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  serverIconActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  serverNameText: {
    color: '#d4d4d8',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  serverLocationText: {
    color: '#a1a1aa',
    fontSize: 13,
  },
  serverItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadPill: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 16,
  },
  loadText: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '600',
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#10b981',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981',
  },
  modalCloseBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  modalCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  }
});
