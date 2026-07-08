import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import {
  confirmLinkCode,
  confirmSignInCode,
  getAuthStatus,
  sendLinkCode,
  sendSignInCode,
  signOutToAnonymous,
} from "../lib/auth";
import { ScreenContainer } from "../components/ScreenContainer";
import { TextField } from "../components/TextField";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { colors, spacing, type } from "../lib/theme";

type Mode = "link" | "signin";
type Step = "email" | "code";

export default function SyncScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null); // synced email if any

  const [mode, setMode] = useState<Mode>("link");
  const [step, setStep] = useState<Step>("email");
  const [emailInput, setEmailInput] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const status = await getAuthStatus();
      setEmail(status.email);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function onSendCode() {
    const e = emailInput.trim().toLowerCase();
    if (!e) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "link") await sendLinkCode(e);
      else await sendSignInCode(e);
      setStep("code");
      setInfo(`We sent a 6-digit code to ${e}. Enter it below.`);
    } catch (err) {
      setError(humanize(err));
    } finally {
      setBusy(false);
    }
  }

  async function onVerify() {
    const e = emailInput.trim().toLowerCase();
    const t = code.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "link") await confirmLinkCode(e, t);
      else await confirmSignInCode(e, t);
      // Back to home; it reflects the synced status and (for sign-in) the
      // synced account's collections on focus.
      router.replace("/");
    } catch (err) {
      setError(humanize(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    setBusy(true);
    setError(null);
    try {
      await signOutToAnonymous();
      await refresh();
      setStep("email");
      setEmailInput("");
      setCode("");
    } catch (err) {
      setError(humanize(err));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setStep("email");
    setCode("");
    setError(null);
    setInfo(null);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Sync" }} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Already synced.
  if (email) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ title: "Sync" }} />
        <Card elevated style={styles.syncedCard}>
          <Text style={styles.syncedIcon}>☁️</Text>
          <Text style={styles.syncedTitle}>Synced</Text>
          <Text style={styles.syncedEmail}>{email}</Text>
          <Text style={styles.help}>
            Your collections are saved to this email. Sign in with it on any
            device to pick up right where you left off.
          </Text>
        </Card>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label="Sign out of this device"
          variant="outline"
          loading={busy}
          onPress={onSignOut}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "Sync" }} />

      <Text style={styles.heading}>
        {mode === "link" ? "Save your account" : "Sign in to sync"}
      </Text>
      <Text style={styles.help}>
        {mode === "link"
          ? "Add your email so you can use Forked — with all your collections — on your other devices. No password; we email you a code."
          : "Enter the email you saved your account with. This device's current collections will be replaced by your synced ones."}
      </Text>

      {info ? <Text style={styles.info}>{info}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {step === "email" ? (
        <>
          <TextField
            placeholder="you@example.com"
            value={emailInput}
            onChangeText={setEmailInput}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            onSubmitEditing={onSendCode}
            returnKeyType="send"
          />
          <Button
            label="Send code"
            loading={busy}
            disabled={!emailInput.trim()}
            onPress={onSendCode}
          />
        </>
      ) : (
        <>
          <TextField
            placeholder="6-digit code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            onSubmitEditing={onVerify}
            returnKeyType="done"
            autoFocus
          />
          <Button label="Verify" loading={busy} disabled={!code.trim()} onPress={onVerify} />
          <Pressable onPress={() => setStep("email")}>
            <Text style={styles.link}>Use a different email</Text>
          </Pressable>
        </>
      )}

      <Pressable
        style={styles.switchRow}
        onPress={() => switchMode(mode === "link" ? "signin" : "link")}
      >
        <Text style={styles.link}>
          {mode === "link"
            ? "Already saved your account elsewhere? Sign in"
            : "New here? Save this account instead"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

// Supabase auth errors come through with technical messages; soften the common ones.
function humanize(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/not allowed|Signups not allowed|user not found/i.test(msg)) {
    return "No synced account found for that email. Use “Save this account” first, on the device that has your collections.";
  }
  if (/already registered|already been registered/i.test(msg)) {
    return "That email is already linked to an account. Use “Sign in” instead.";
  }
  if (/invalid|expired|token/i.test(msg)) {
    return "That code didn't work. Double-check it, or request a new one.";
  }
  return msg;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  heading: { ...type.heading },
  help: { ...type.body, color: colors.inkSecondary },
  info: { ...type.body, color: colors.yes },
  error: { color: colors.pass },
  link: { ...type.label, color: colors.primary },
  switchRow: { paddingTop: spacing.sm, alignItems: "center" },
  syncedCard: { alignItems: "center", gap: spacing.xs },
  syncedIcon: { fontSize: 40 },
  syncedTitle: { ...type.heading },
  syncedEmail: { ...type.subtitle, color: colors.primary },
});
