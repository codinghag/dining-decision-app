import { useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  confirmLinkCode,
  confirmSignInCode,
  getAuthStatus,
  isEmailAlreadyRegistered,
  sendLinkCode,
  sendSignInCode,
} from "../lib/auth";
import { TextField } from "./TextField";
import { Button } from "./Button";
import { radius, shadow, spacing, themedStyles, useTheme } from "../lib/theme";

type Step = "email" | "code";
type OtpType = "email" | "email_change";

// The launch sign-in wall. Reused for both new sign-ups and migrating an
// existing anonymous account (its "Send code" auto-links when the current
// session is anonymous -- see onSend). Rendered by the root layout before the
// app when there's no permanent session, so it isn't a router screen.
export function SignInGate({ onSignedIn }: { onSignedIn: () => void }) {
  const { scheme } = useTheme();
  const styles = themed[scheme];
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpType, setOtpType] = useState<OtpType>("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSend() {
    const e = email.trim().toLowerCase();
    if (!e) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { hasSession, isAnonymous } = await getAuthStatus();
      if (hasSession && isAnonymous) {
        // Migrate this anonymous account in place -> keeps its collections.
        try {
          await sendLinkCode(e);
          setOtpType("email_change");
        } catch (linkErr) {
          if (isEmailAlreadyRegistered(linkErr)) {
            // Email already has an account: sign into it instead (this
            // device's anonymous data won't carry over -- known limitation).
            await sendSignInCode(e);
            setOtpType("email");
          } else {
            throw linkErr;
          }
        }
      } else {
        await sendSignInCode(e);
        setOtpType("email");
      }
      setStep("code");
      setInfo(`We emailed a code to ${e}. Enter it below.`);
    } catch (err) {
      setError(humanize(err));
    } finally {
      setBusy(false);
    }
  }

  async function onVerify() {
    const e = email.trim().toLowerCase();
    const t = code.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      if (otpType === "email_change") await confirmLinkCode(e, t);
      else await confirmSignInCode(e, t);
      onSignedIn();
    } catch (err) {
      setError(humanize(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <LinearGradient
        // Soft saffron glow behind the brand lockup — warm, not loud.
        colors={[glowColor[scheme], "transparent"]}
        style={styles.glow}
        pointerEvents="none"
      />
      <View style={styles.lockup}>
        <Image
          source={require("../assets/icon.png")}
          style={styles.mark}
          accessible={false}
          importantForAccessibility="no"
        />
        <Text style={styles.brand} accessibilityRole="header">
          Forked
        </Text>
        <Text style={styles.tagline}>Decide where to eat, together.</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formLabel}>
          {step === "email" ? "Sign in or create an account" : "Check your email"}
        </Text>

        {info ? (
          <Text style={styles.info} accessibilityLiveRegion="polite">
            {info}
          </Text>
        ) : null}
        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}

        {step === "email" ? (
          <>
            <TextField
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              onSubmitEditing={onSend}
              returnKeyType="send"
            />
            <Button label="Send code" loading={busy} disabled={!email.trim()} onPress={onSend} />
          </>
        ) : (
          <>
            <TextField
              placeholder="Enter code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              onSubmitEditing={onVerify}
              returnKeyType="done"
              autoFocus
            />
            <Button label="Verify" loading={busy} disabled={!code.trim()} onPress={onVerify} />
            <Button
              label="Use a different email"
              variant="outline"
              onPress={() => {
                setStep("email");
                setCode("");
                setError(null);
                setInfo(null);
              }}
            />
          </>
        )}
      </View>

      <Text style={styles.footnote}>
        Your collections sync to your email — no passwords, just a one-time code.
      </Text>
    </ScrollView>
  );
}

// Gradient endpoints can't come from themedStyles (LinearGradient takes a
// colors prop, not a style), so they're keyed by scheme here.
const glowColor = {
  light: "rgba(217, 154, 43, 0.18)",
  dark: "rgba(228, 180, 94, 0.12)",
} as const;

function humanize(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Email-format errors ("Unable to validate email address: invalid format")
  // must be checked before the generic token/invalid branch, since they also
  // contain "invalid".
  if (/valid email|invalid format|email address/i.test(msg)) {
    return "That doesn't look like a valid email address.";
  }
  if (/rate limit|too many|only request|for security/i.test(msg)) {
    return "Too many attempts — wait a minute and try again.";
  }
  if (/expired|token|otp|invalid/i.test(msg)) {
    return "That code didn't work. Double-check it, or request a new one.";
  }
  return msg;
}

const themed = themedStyles((colors, type) => ({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    justifyContent: "center" as const,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  glow: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    height: 320,
  },
  lockup: { alignItems: "center" as const, gap: spacing.sm },
  mark: {
    width: 84,
    height: 84,
    borderRadius: radius.xl,
    boxShadow: shadow.raised,
  },
  brand: { ...type.title, fontSize: 40, textAlign: "center" as const, marginTop: spacing.xs },
  tagline: {
    ...type.body,
    fontSize: 16,
    color: colors.inkSecondary,
    textAlign: "center" as const,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    boxShadow: shadow.card,
  },
  formLabel: { ...type.label, textAlign: "center" as const },
  info: { ...type.body, color: colors.yes, textAlign: "center" as const },
  error: { color: colors.pass, textAlign: "center" as const },
  footnote: {
    ...type.caption,
    textAlign: "center" as const,
    paddingHorizontal: spacing.lg,
  },
}));
