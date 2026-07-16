import { useState } from "react";
import { ScrollView, Text } from "react-native";
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
import { spacing, themedStyles, useTheme } from "../lib/theme";

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
      <Text accessible={false} style={styles.logo}>
        🍽️
      </Text>
      <Text style={styles.brand} accessibilityRole="header">
        Forked
      </Text>
      <Text style={styles.tagline}>Sign in to save your collections and use Forked on any device.</Text>

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
    </ScrollView>
  );
}

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
    gap: spacing.md,
  },
  logo: { fontSize: 48, textAlign: "center" as const },
  brand: { ...type.title, textAlign: "center" as const },
  tagline: {
    ...type.body,
    color: colors.inkSecondary,
    textAlign: "center" as const,
    marginBottom: spacing.sm,
  },
  info: { ...type.body, color: colors.yes, textAlign: "center" as const },
  error: { color: colors.pass, textAlign: "center" as const },
}));
