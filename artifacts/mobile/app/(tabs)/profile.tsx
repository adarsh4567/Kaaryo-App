import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAppContext } from '@/context/AppContext';

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, setUser, apiUrl, saveApiUrl } = useAppContext();

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [url, setUrl] = useState(apiUrl);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }
    if (!/^\d{10}$/.test(phone)) {
      Alert.alert('Invalid phone', 'Please enter a valid 10-digit mobile number.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Promise.all([setUser({ name: name.trim(), phone }), saveApiUrl(url)]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: topPad + 16,
          paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 100,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{(user?.name ?? 'K')[0].toUpperCase()}</Text>
        </View>
        <Text style={[styles.profileName, { color: colors.foreground }]}>
          {user?.name ?? 'Set your name'}
        </Text>
        <Text style={[styles.profilePhone, { color: colors.mutedForeground }]}>
          {user?.phone ? `+91 ${user.phone}` : 'No phone set'}
        </Text>
      </View>

      {/* Personal Info */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          PERSONAL INFO
        </Text>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Name</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Ionicons name="person-outline" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Mobile</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Text style={[styles.countryCode, { color: colors.foreground }]}>+91</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit number"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
            />
          </View>
        </View>
      </View>

      {/* API Config */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          BACKEND API
        </Text>
        <Text style={[styles.apiHint, { color: colors.mutedForeground }]}>
          Point this to your Kaaryo backend server.
        </Text>
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>API URL</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Ionicons name="link-outline" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              value={url}
              onChangeText={setUrl}
              placeholder="http://localhost:4000"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
        </View>
      </View>

      {/* Save */}
      <Pressable
        onPress={handleSave}
        style={({ pressed }) => [
          styles.saveBtn,
          { backgroundColor: saved ? colors.accent : colors.primary, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Ionicons name={saved ? 'checkmark' : 'save-outline'} size={20} color="#fff" />
        <Text style={styles.saveBtnText}>{saved ? 'Saved!' : 'Save Changes'}</Text>
      </Pressable>

      <Text style={[styles.version, { color: colors.mutedForeground }]}>
        Kaaryo v1.0.0 · Cash payment only
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16 },
  avatarSection: { alignItems: 'center', marginBottom: 28 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 36,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  profileName: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  profilePhone: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 4 },
  card: {
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  apiHint: { fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 12, marginTop: -8 },
  field: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
  },
  countryCode: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  input: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 15,
    gap: 8,
    marginTop: 4,
    marginBottom: 20,
    shadowColor: '#FF5533',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  saveBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  version: { textAlign: 'center', fontSize: 12, fontFamily: 'Inter_400Regular' },
});
