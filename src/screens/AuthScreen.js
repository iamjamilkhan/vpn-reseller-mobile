import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Button } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { ShieldAlert, QrCode, X } from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Application from 'expo-application';

export default function AuthScreen({ navigation }) {
  const [codeKey, setCodeKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [isScanning, setIsScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  // Auto-login check
  useEffect(() => {
    const checkExistingSession = async () => {
      const savedKey = await SecureStore.getItemAsync('vpn_code_key');
      if (savedKey) {
        // Skip straight to Home if we have a key
        navigation.replace('Home');
      }
    };
    checkExistingSession();
  }, []);

  const handleActivate = async () => {
    if (codeKey.length < 10) {
      setError('Please enter a valid 13-character Code Key.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Get or create a permanent Hardware UUID for binding
      let hardwareId = await SecureStore.getItemAsync('hardware_device_id');
      if (!hardwareId) {
        if (Platform.OS === 'ios') {
          // iOS physical device UUID
          hardwareId = await Application.getIosIdForVendorAsync();
        } else if (Platform.OS === 'android') {
          // Android 64-bit hardware ID
          hardwareId = Application.getAndroidId();
        }

        // Web fallback or failure fallback
        if (!hardwareId) {
           hardwareId = `dev_${Math.random().toString(36).substring(2, 12)}`;
        }
        await SecureStore.setItemAsync('hardware_device_id', hardwareId);
      }

      // 1. Call your Next.js Backend API
      const DASHBOARD_API = 'https://nexus-vpn-dashboard.vercel.app/api/client/activate';

      console.log(`Activating key ${codeKey} for physical hardware ID: ${hardwareId}...`);

      const response = await fetch(DASHBOARD_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code_key: codeKey, device_id: hardwareId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to activate key');
      }

      // If success, store the key
      await SecureStore.setItemAsync('vpn_code_key', codeKey);

      console.log('API returned configs:', JSON.stringify(data.configs));

      // Normalize and store the returned configs
      let normalizedConfigs = [];
      if (data.configs && data.configs.length > 0) {
        normalizedConfigs = data.configs.map((c, index) => {
          // If it's a newly generated config
          if (c.config) {
            return {
              id: `server_${index}`,
              name: c.serverName,
              location: c.location,
              load: typeof c.load === 'number' ? c.load : 0,
              status: 'active',
              configStr: c.config
            };
          } 
          // If it's returning existing DB records
          else if (c.servers) {
            // Use raw_config from DB if available (has correct server pubkey and port)
            const wgConfig = c.raw_config || `[Interface]\nPrivateKey = ${c.wg_private_key}\nAddress = ${c.internal_ip}/32\nDNS = 1.1.1.1, 8.8.8.8\nMTU = 1280\n\n[Peer]\nPublicKey = ${c.wg_public_key}\nEndpoint = ${c.servers.ip_address}:51820\nAllowedIPs = 0.0.0.0/0, ::/0\nPersistentKeepalive = 25`;
            return {
              id: `server_${c.server_id}`,
              name: c.servers.name,
              location: c.servers.location,
              load: typeof c.load === 'number' ? c.load : 0,
              status: 'active',
              configStr: wgConfig
            };
          }
          return null;
        }).filter(Boolean);
        
        await SecureStore.setItemAsync('vpn_configs', JSON.stringify(normalizedConfigs));
        console.log('Saved normalized configs to SecureStore:', normalizedConfigs.length);
      } else {
        console.warn('No configs were returned from the API.');
        await SecureStore.setItemAsync('vpn_configs', JSON.stringify([]));
      }

      navigation.replace('Home');
    } catch (err) {
      setError('Activation Failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const parseWireGuardConfig = (configStr) => {
    const config = {
      name: `Custom Server ${Math.floor(Math.random() * 1000)}`,
      privateKey: '',
      publicKey: '',
      serverAddress: '',
      serverPort: 51820,
      addresses: ['10.0.0.2/32'],
      allowedIPs: ['0.0.0.0/0'],
      dns: ['1.1.1.1'],
      mtu: 1420
    };

    const lines = configStr.split('\n');
    lines.forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (!key || valueParts.length === 0) return;

      const val = valueParts.join('=').trim();
      const k = key.trim().toLowerCase();

      if (k === 'privatekey') config.privateKey = val;
      if (k === 'publickey') config.publicKey = val;
      if (k === 'presharedkey') config.presharedKey = val;
      if (k === 'endpoint') {
        const parts = val.split(':');
        config.serverAddress = parts[0];
        if (parts[1]) config.serverPort = parseInt(parts[1], 10);
      }
      if (k === 'allowedips') config.allowedIPs = val.split(',').map(s => s.trim());
      if (k === 'address') config.addresses = val.split(',').map(s => s.trim());
      if (k === 'dns') config.dns = val.split(',').map(s => s.trim());
      if (k === 'mtu') config.mtu = parseInt(val, 10) || 1420;
    });

    return config;
  };

  const handleScanPress = async () => {
    if (!permission?.granted) {
      const { status } = await requestPermission();
      if (status !== 'granted') {
        setError('Camera permission is required to scan QR codes.');
        return;
      }
    }
    setIsScanning(true);
    setError('');
  };

  const handleBarcodeScanned = async ({ type, data }) => {
    setIsScanning(false);
    const scannedText = data.trim();

    // Check if it's a generic WireGuard config
    if (scannedText.startsWith('[Interface]')) {
      try {
        setLoading(true);
        const parsedConfig = parseWireGuardConfig(scannedText);

        // Load existing custom configs, append new one, and save
        const savedCustomConfigsStr = await SecureStore.getItemAsync('generic_wg_configs');
        let customConfigs = savedCustomConfigsStr ? JSON.parse(savedCustomConfigsStr) : [];

        customConfigs.push({
          id: `custom_${Date.now()}`,
          name: parsedConfig.name,
          location: 'Custom QR',
          load: '0%',
          status: 'active',
          isCustom: true,
          config: parsedConfig
        });

        await SecureStore.setItemAsync('generic_wg_configs', JSON.stringify(customConfigs));

        // Ensure user has some kind of dummy vpn_code_key so they can bypass the auth screen in the future
        let existingKey = await SecureStore.getItemAsync('vpn_code_key');
        if (!existingKey) {
          await SecureStore.setItemAsync('vpn_code_key', 'CUSTOM-WG-CONFIG');
        }

        navigation.replace('Home');
      } catch (err) {
        setError('Failed to import generic WireGuard config.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Otherwise, treat it as a standard access code key
    setCodeKey(scannedText.toUpperCase());
    // Auto-activate could happen here, but letting user press the button is safer feedback for now.
  };

  if (isScanning) {
    return (
      <View style={styles.container}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={handleBarcodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
        />
        <View style={styles.scannerOverlay}>
          <View style={styles.scannerTarget} />
          <TouchableOpacity style={styles.closeScannerButton} onPress={() => setIsScanning(false)}>
            <X color="#fff" size={24} />
            <Text style={{ color: '#fff', marginLeft: 8, fontWeight: 'bold' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <View style={styles.iconWrapper}>
            <ShieldAlert color="#FFFFFF" size={40} />
          </View>
          <Text style={styles.title}>Nexus<Text style={styles.titleHighlight}>VPN</Text></Text>
          <Text style={styles.subtitle}>Enter your Access Key to unlock all servers.</Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.label}>1-MONTH CODE KEY</Text>
          <TextInput
            style={styles.input}
            placeholder="VPN-XXXX-YYYY"
            placeholderTextColor="#a1a1aa"
            value={codeKey}
            onChangeText={(text) => {
              setCodeKey(text.toUpperCase());
              setError('');
            }}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity style={styles.button} onPress={handleActivate} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Activate Subscription</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.scanButton} onPress={handleScanPress} disabled={loading}>
            <QrCode color="#a1a1aa" size={20} />
            <Text style={styles.scanButtonText}>Scan QR Code</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#3b82f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -1,
  },
  titleHighlight: {
    color: '#6366f1',
  },
  subtitle: {
    color: '#a1a1aa',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  formContainer: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  label: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    color: '#ffffff',
    fontSize: 18,
    padding: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#ef4444',
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 14,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
  },
  scanButtonText: {
    color: '#a1a1aa',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerTarget: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#6366f1',
    backgroundColor: 'transparent',
    borderRadius: 16,
  },
  closeScannerButton: {
    position: 'absolute',
    bottom: 50,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
  }
});
