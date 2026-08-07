-- Dining Decision App — claim flag for the "session completed" push.
-- Builds on 0003/0020/0021 (do not edit those). Run via `supabase db push`.
--
-- notified_at is set atomically (UPDATE ... WHERE notified_at IS NULL) by
-- notify-decide-complete so exactly one push fires even if several members'
-- clients race to complete+notify at once (e.g. the 60s auto-timer expiring
-- while multiple people are on the screen).
alter table public.decide_sessions
  add column if not exists notified_at timestamptz;
