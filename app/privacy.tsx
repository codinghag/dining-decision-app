import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, spacing, type } from "../lib/theme";

// Public, unauthenticated route — see app/_layout.tsx, which special-cases
// this path to bypass the sign-in gate. Required to be reachable without an
// account for the Play Store listing and for App Tracking/App Store review.
export default function PrivacyPolicy() {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <Text style={type.title}>Privacy Policy</Text>
      <Text style={styles.updated}>Last updated: July 10, 2026</Text>

      <Section title="What Forked is">
        Forked is a friend-group dining decision app. Groups create shared
        collections of restaurants and use Forked to swipe, vote, and pick
        where to eat.
      </Section>

      <Section title="Information we collect">
        {"•"} Email address, used only to send a one-time sign-in code
        and keep your collections tied to your account across devices.
        {"\n\n"}
        {"•"} Location, used only when you search for restaurants, to
        show nearby results first. You can decline location access and still
        search manually.
        {"\n\n"}
        {"•"} Restaurant data you save (name, notes, links you import
        from), and the collections and votes you create.
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
        Solely to run the app: authenticate you, sync your collections
        across devices, personalize restaurant search by location, and
        notify your group about decisions. We do not sell your data or use
        it for advertising.
      </Section>

      <Section title="Who we share it with">
        {"•"} Supabase, our backend provider, which stores your account
        and collection data.
        {"\n\n"}
        {"•"} Google Places API, which we query on your behalf when you
        search for or import a restaurant. Your search terms and approximate
        location are sent to Google to return results; Google's own privacy
        policy governs that processing.
        {"\n\n"}
        We do not share your data with advertisers or other third parties.
      </Section>

      <Section title="Your choices">
        You can delete any restaurant, collection, or your entire account's
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
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{title}</Text>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  updated: { ...type.caption, marginTop: spacing.xs, marginBottom: spacing.lg },
  section: { marginBottom: spacing.lg },
  body: { ...type.body, color: colors.inkSecondary, marginTop: spacing.sm, lineHeight: 22 },
});
