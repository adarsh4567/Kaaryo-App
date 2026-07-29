import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAppContext } from '@/context/AppContext';

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setUser } = useAppContext();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

  function validate() {
    const e: { name?: string; phone?: string } = {};
    if (!name.trim()) e.name = 'Please enter your name';
    if (!/^\d{10}$/.test(phone)) e.phone = 'Enter a valid 10-digit mobile number';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleContinue() {
    if (!validate()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    await setUser({ name: name.trim(), phone });
    setLoading(false);
    router.replace('/(tabs)');
  }

  const s = styles(colors, insets);

  return (
    <LinearGradient
      colors={[colors.background, colors.background]}
      style={s.container}
    >
      {/* Brand header */}
      <View style={[s.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) }]}>
        <View style={s.logoBox}>
          <Text style={s.logoK}>K</Text>
        </View>
        <Text style={s.brandName}>Kaaryo</Text>
        <Text style={s.tagline}>Home services, made simple</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.formArea}
      >
        <View style={s.card}>
          <Text style={s.cardTitle}>Let's get started</Text>
          <Text style={s.cardSub}>
            We only need your name and phone to book services.
          </Text>

          {/* Name */}
          <View style={s.fieldWrap}>
            <Text style={s.label}>Full Name</Text>
            <View style={[s.inputRow, errors.name ? s.inputError : null]}>
              <Ionicons name="person-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                style={s.input}
                placeholder="e.g. Priya Sharma"
                placeholderTextColor={colors.mutedForeground}
                value={name}
                onChangeText={(t) => { setName(t); setErrors((e) => ({ ...e, name: undefined })); }}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>
            {errors.name ? <Text style={s.errorText}>{errors.name}</Text> : null}
          </View>

          {/* Phone */}
          <View style={s.fieldWrap}>
            <Text style={s.label}>Mobile Number</Text>
            <View style={[s.inputRow, errors.phone ? s.inputError : null]}>
              <Text style={s.countryCode}>+91</Text>
              <TextInput
                style={s.input}
                placeholder="10-digit mobile number"
                placeholderTextColor={colors.mutedForeground}
                value={phone}
                onChangeText={(t) => {
                  const digits = t.replace(/\D/g, '').slice(0, 10);
                  setPhone(digits);
                  setErrors((e) => ({ ...e, phone: undefined }));
                }}
                keyboardType="phone-pad"
                returnKeyType="done"
                onSubmitEditing={handleContinue}
              />
            </View>
            {errors.phone ? <Text style={s.errorText}>{errors.phone}</Text> : null}
          </View>

          <Pressable
            onPress={handleContinue}
            disabled={loading}
            style={({ pressed }) => [s.ctaBtn, { opacity: pressed ? 0.85 : 1 }]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={s.ctaText}>Continue</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </>
            )}
          </Pressable>

          <Text style={s.disclaimer}>
            No account needed. Your info stays on your device.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = (colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      alignItems: 'center',
      paddingBottom: 32,
      paddingHorizontal: 24,
    },
    logoBox: {
      width: 72,
      height: 72,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 8,
    },
    logoK: {
      fontSize: 40,
      fontWeight: '800' as const,
      color: '#fff',
      fontFamily: 'Inter_700Bold',
      letterSpacing: -1,
    },
    brandName: {
      fontSize: 32,
      fontWeight: '700' as const,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      letterSpacing: -0.5,
    },
    tagline: {
      fontSize: 15,
      color: colors.mutedForeground,
      marginTop: 4,
      fontFamily: 'Inter_400Regular',
    },
    formArea: { flex: 1, paddingHorizontal: 20 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 3,
    },
    cardTitle: {
      fontSize: 22,
      fontWeight: '700' as const,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      marginBottom: 6,
    },
    cardSub: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
      marginBottom: 24,
      lineHeight: 20,
    },
    fieldWrap: { marginBottom: 16 },
    label: {
      fontSize: 13,
      fontWeight: '600' as const,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
      marginBottom: 6,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.muted,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    inputError: { borderColor: colors.destructive },
    countryCode: {
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
    },
    input: {
      flex: 1,
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
      color: colors.foreground,
    },
    errorText: {
      fontSize: 12,
      color: colors.destructive,
      marginTop: 4,
      fontFamily: 'Inter_400Regular',
    },
    ctaBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      gap: 8,
      marginTop: 8,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 6,
    },
    ctaText: {
      fontSize: 17,
      fontWeight: '700' as const,
      fontFamily: 'Inter_700Bold',
      color: '#fff',
    },
    disclaimer: {
      fontSize: 12,
      color: colors.mutedForeground,
      textAlign: 'center',
      marginTop: 16,
      fontFamily: 'Inter_400Regular',
    },
  });
