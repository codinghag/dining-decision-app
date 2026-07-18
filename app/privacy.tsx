import { ScrollView, Text, View } from "react-native";
import { spacing, themedStyles, useTheme } from "../lib/theme";

// Public, unauthenticated route — see app/_layout.tsx, which special-cases
// this path to bypass the sign-in gate. Required to be reachable without an
// account for the Play Store listing and for App Tracking/App Store review.
export default function PrivacyPolicy() {
  const { scheme } = useTheme();
  const styles = themed[scheme];
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title} accessibilityRole="header">
        Privacy Policy
      </Text>
      <Text style={styles.updated}>Last updated: July 10, 2026</Text>

      <Section title="What Forked is">
        Forked is a friend-group dining decision app. Groups create shared
        lists of restaurants and use Forked to swipe, vote, and pick
        where to eat.
      </Section>

      <Section title="Information we collect">
        {"•"} Email address, used only to send a one-time sign-in code
        and keep your lists tied to your account across devices. Joining a
        group and voting via an invite link works without an email; one is
        only collected if you choose to save your account.
        {"\n\n"}
        {"•"} Location, used only when you search for restaurants, to
        show nearby results first. You can decline location access and still
        search manually.
        {"\n\n"}
        {"•"} Restaurant data you save (name, notes, links you import
        from), and the lists and votes you create.
        {"\n\n"}
        {"•"} Basic usage events (e.g. app opened, restaurant added, a
        group decision completed) so we can tell which features are actually
        used. These are tied to your account, not sold or shared, and never
        used for advertising.
        {"\n\n"}
        {"•"} A push notification token, only if you enable
        notifications, so we can alert you when your group makes a decision.
      </Section>

      <Section title="How we use it">
        Solely to run the app: authenticate you, sync your lists
        across devices, personalize restaurant search by location, and
        notify your group about decisions. We do not sell your data or use
        it for advertising.
      </Section>

      <Section title="Who we share it with">
        {"•"} Supabase, our backend provider, which stores your account
        and list data.
        {"\n\n"}
        {"•"} Google Places API, which we query on your behalf when you
        search for or import a restaurant. Your search terms and approximate
        location are sent to Google to return results; Google's own privacy
        policy governs that processing.
        {"\n\n"}
        We do not share your data with advertisers or other third parties.
      </Section>

      <Section title="Your choices">
        You can delete any restaurant, list, or your entire account's
        data at any time from within the app. To request full account
        deletion, contact us using the email below.
      </Section>

      <Section title="Contact">
        Questions about this policy or your data: cena25@gmail.com
      </Section>
    </ScrollView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { scheme } = useTheme();
  const styles = themed[scheme];
  return (
    <View style={styles.section}>
      <Text style={styles.heading} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

const themed = themedStyles((colors, type) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { ...type.title },
  heading: { ...type.heading },
  updated: { ...type.caption, marginTop: spacing.xs, marginBottom: spacing.lg },
  section: { marginBottom: spacing.lg },
  body: { ...type.body, color: colors.inkSecondary, marginTop: spacing.sm, lineHeight: 22 },
}));
