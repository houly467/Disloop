# Disloop

A bilingual (Arabic / English) community hub connected to a Discord server. Implemented stages (a)–(d) and (f) include member-only News and Reels, editable public profiles, searchable content and topic pages, XP and badges, moderator tools, Discord role sync, and optional announcement embeds.

## Stage (a) setup

1. Connect the project to Neon and Vercel Blob. The app reads `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` from those integrations.
2. Add the Discord settings listed in `.env.example` to the project’s environment variables. Set `SESSION_SECRET` to a random value with at least 32 characters. Never commit real credentials or paste them into chat.
3. Create a Discord application at <https://discord.com/developers/applications>.
4. In **OAuth2 → General**, keep **Public Client** off. Add the callback URLs listed below. The user sign-in flow requests the `identify` scope only; it never asks members to authorize the bot.
5. In **Bot**, create the bot and copy its token to the private `DISCORD_BOT_TOKEN` environment variable. Enable **Server Members Intent** under Privileged Gateway Intents. The stage-a membership check uses the bot API endpoint `GET /guilds/{guild_id}/members/{user_id}`.
6. Invite the bot separately as a one-time server-admin action. Use the application client ID and this least-privilege permission set (no Administrator):

   ```text
   https://discord.com/oauth2/authorize?client_id=YOUR_DISCORD_CLIENT_ID&scope=bot%20applications.commands&permissions=268553216&integration_type=0
   ```

   The scopes are `bot` and `applications.commands`; `integration_type=0` selects Guild Install. The permission integer includes Manage Roles, View Channels, Send Messages, Embed Links, Attach Files, and Read Message History. Optional stage-(f) role sync and Discord embeds are enabled after the IDs below are configured.

7. Set `SITE_URL=https://disloop.me`. Add `disloop.me` to the Vercel project under **Settings → Domains**, then configure the DNS records Vercel displays. The OAuth callback must use HTTPS in production.

## Optional stage-(f) Discord configuration

- Set `DISCORD_MODERATOR_ROLE_IDS` to a comma-separated allowlist of moderator role IDs. Only members with one of these server roles can access the moderation queue.
- Set `DISCORD_XP_ROLE_MAP` as comma-separated `XP_THRESHOLD:ROLE_ID` pairs. The app keeps the highest eligible XP role and leaves all other member roles untouched.
- Set `DISCORD_ANNOUNCEMENTS_CHANNEL_ID` to a channel where the bot can send embeds. If it is unset, publishing still succeeds and no embed is sent.
- Keep managed XP roles below the bot role in Discord&apos;s role order, and enable Server Members Intent. Do not grant Administrator.

## Discord OAuth redirect URLs

Register each exact callback URL in **OAuth2 → General → Redirects**; do not use wildcard hosts:

- Production: `https://disloop.me/auth/callback`
- Local Next.js development: `http://localhost:3000/auth/callback`
- Optional local preview on port 5173: `http://localhost:5173/auth/callback`
- Vercel preview: `https://<the exact VERCEL_URL host>/auth/callback`
- v0 preview: `https://<the exact V0_RUNTIME_URL host>/auth/callback` (also register the exact preview host currently shown by v0 if it differs)

The sign-in route uses the current origin only when it matches `SITE_URL`, the exact Vercel/v0 runtime origins, or the listed localhost origins. When a preview URL changes, register that new exact callback URL in Discord before testing sign-in there.

## Environment variables

See `.env.example` for placeholders. Required values are `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID`, `DISCORD_BOT_TOKEN`, `DISCORD_INVITE_URL`, `SESSION_SECRET`, `SITE_URL`, `DATABASE_URL`, and `BLOB_READ_WRITE_TOKEN`. The Discord client secret, bot token, session secret, and integration credentials are private server-side values. Never expose them in client code.

## قاعدة الإعداد بالعربية

1. اربط المشروع بخدمتي Neon وVercel Blob؛ يستخدم التطبيق `DATABASE_URL` و`BLOB_READ_WRITE_TOKEN` من التكاملين.
2. أنشئ تطبيقًا في [Discord Developer Portal](https://discord.com/developers/applications)، وأبقِ خيار **Public Client** مغلقًا. أضف روابط إعادة التوجيه أعلاه ضمن **OAuth2 → General → Redirects**. تسجيل دخول الأعضاء يستخدم صلاحية `identify` فقط، ولا يطلب منهم تفويض البوت.
3. أنشئ البوت وانسخ رمزه إلى `DISCORD_BOT_TOKEN` في متغيرات البيئة الخاصة بالمشروع. فعّل **Server Members Intent** من إعدادات البوت.
4. أضف البوت مرة واحدة إلى السيرفر من رابط الدعوة أعلاه، باستخدام الصلاحيات المحددة فقط ودون صلاحية Administrator. دعوة البوت منفصلة عن تسجيل دخول الأعضاء.
5. أضف `disloop.me` إلى **Settings → Domains** في مشروع Vercel، ثم أضف سجلات DNS التي تعرضها Vercel. استخدم HTTPS في رابط OAuth الإنتاجي.
6. انسخ أسماء المتغيرات من `.env.example` إلى إعدادات المشروع، وضع القيم السرية في متغيرات البيئة فقط. يجب أن يكون `SESSION_SECRET` عشوائيًا وبطول 32 حرفًا على الأقل. لا تضع أي سر في الشيفرة أو المحادثة.

### تسلسل الأدوار في Discord

عند تفعيل مزامنة الأدوار في المرحلة (f)، يجب وضع دور البوت **فوق كل دور** سيُديره في تسلسل أدوار السيرفر، مع إبقاء صلاحياته محدودة. يجب أيضًا تفعيل **Server Members Intent**.

## Data model

- `disloop_users`: Discord identity, editable profile links and bio, XP, server-membership state, and case-insensitive unique usernames.
- `disloop_news_posts`: News content, optional cover URL, category, normalized tags, pin and moderation state. The tag array has a GIN index.
- `disloop_reels`: public video URLs, captions, normalized tags, and soft-moderation state, with a feed index and hashtag GIN index.
- `disloop_reel_likes`: one like per member per Reel. `disloop_xp_events` makes XP rewards idempotent.
- Initial usernames are generated from Discord names and retained on later sign-ins. OAuth state is signed and time-limited; the session is a seven-day signed, HTTP-only cookie. Every publishing and upload request verifies current guild membership server-side.

## Roadmap

- [x] (a) Discord login, membership gating, bilingual navigation, and News publishing.
- [x] (b) Public profiles, username editing, linked social accounts, and profile content.
- [x] (c) Reels feed, direct video uploads, likes, and publishing.
- [x] (d) Community search, hashtags, and topic pages.
- [ ] (e) Stories and Daily Life.
- [x] (f) XP, badges, optional Discord role synchronization and embeds, and moderator controls.

Discord role synchronization, moderator access, and announcement embeds activate when their optional IDs are configured. The News cards shown at first launch are clearly marked sample content.
