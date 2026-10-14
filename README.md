# HobbyNest

HobbyNest is a learning platform for extracurricular skills, hobbies, workshops and educator-led classes, with two roles: **learners** and **educators**.

Frontend: plain HTML, CSS and JavaScript (no build step).
Backend: Supabase (Auth, PostgreSQL, Row Level Security).

## Setup

1. **Database** — Supabase Dashboard → SQL Editor → paste all of `database.sql` → Run.
   The file is safe to re-run: it creates what's missing, adds missing columns and
   rebuilds every security policy, so it is the single source of truth for the database.
2. **Auth URLs** — Supabase Dashboard → Authentication → URL Configuration:
   set **Site URL** to your actual deployed Netlify address (do not copy the example
   hostname), and add `https://YOUR-REAL-SITE-NAME.netlify.app/**` under **Redirect URLs**.
   For VS Code Live Server, also add `http://127.0.0.1:5500/**`. The confirm-signup
   template uses Supabase's `{{ .RedirectTo }}` so the link follows the redirect URL
   passed by the signup form; that URL must be allow-listed.
   ⚠️ If the Site URL is still `http://localhost:3000` (Supabase's default) or a Live Server address,
   verification links open a page that "can't be reached" on any other device.
3. **Verification email, deletion and emails** — follow **SUPABASE-SETUP.txt** (step by step).
4. **Run locally** — use a local server (VS Code Live Server works well), not `file://`.
   Open the root `index.html`; it redirects to the login page.

The browser uses the Supabase **publishable** key in `src/js/supabase.js`.
Never put a service-role/secret key in frontend code.

## User flow

Sign up → "Check your inbox" screen → click the email link → **verify page: "Registration complete"**
(+ welcome email) → choose role → share location → dashboard.

- `guard.js` protects every app page: logged-out users go to login, users who haven't
  finished onboarding go to role selection, and the wrong role is sent to its own dashboard.
- The role can be changed during onboarding, then it is **locked** by the database.

## Folder structure

```text
hobbynest/
├── index.html                    → redirects to login
├── 404.html                      → "page not found" page (used by Netlify)
├── _headers                      → security headers for Netlify (content policy etc.)
├── _redirects                    → hides the developer files below from the website
├── database.sql                  → full Supabase schema, security policies and functions
├── seed-demo.sql                 → OPTIONAL starter catalog: 6 sample educators, 21 classes, 5 meetups
├── remove-demo.sql               → removes everything seed-demo.sql added
├── supabase-check.sql            → read-only health check of your database
├── SUPABASE-SETUP.txt            → what to do in Supabase, step by step (START HERE)
├── TESTING.txt                   → step-by-step test plan (manual checklist + how to run automated tests)
├── tests/                        → automated tests: db/ (SQL), functions/ (Deno), e2e/ (browser)
├── email-templates/
│   └── confirm-signup.html       → paste into Supabase → Authentication → Emails → "Confirm signup"
├── supabase/functions/           → server code (Supabase Edge Functions), not part of the website
│   ├── _shared/common.ts         → server key, login check, email sending (Resend), email layout
│   ├── delete-account/           → deletes the caller's account + photos, emails a confirmation
│   └── notify/                   → welcome, new-message and new-session emails (+ optional webhook)
└── src/
    ├── js/
    │   ├── supabase.js           → Supabase client
    │   ├── auth.js               → login, forgot password, "account deleted" notice, resend verification
    │   ├── verify.js             → verify.html: handles every verification link, "Registration complete"
    │   ├── email-config.js       → OPTIONAL EmailJS keys (welcome + account-deleted emails)
    │   ├── notify.js             → sends those emails (EmailJS, or the advanced edge functions); never blocks the app
    │   ├── account.js            → "Delete account" for learners (Profile) and educators (Settings)
    │   ├── signup.js             → signup + "Check your inbox" screen, resend, already-registered check
    │   ├── guard.js              → page protection; unread badge + dashboard banner + new-message pop-ups;
    │   │                           reloads if another tab signs in as a different account
    │   ├── logout.js             → logout buttons ([data-logout])
    │   ├── ui.js                 → learner-page helpers: toast, mobile menu, search, join-session popup
    │   ├── courses.js            → shared helpers: categories, fees, YouTube, progress, sessions, photo upload, ratings
    │   ├── course-page.js        → class page: lectures, lessons + progress, enroll, save, sessions
    │   ├── educator-dashboard.js → classes, students, analytics, sessions, activity
    │   ├── edit-class.js         → load + save a class (update_course)
    │   ├── recorded-lectures.js  → educator lecture library: watch, edit, delete
    │   ├── profile-page.js       → learner profile + photo
    │   ├── settings-page.js      → learner settings + change password
    │   ├── educator-profile.js   → educator profile/settings sections + photo + password
    │   ├── socials.js            → Socials feed: posts with photos, likes, comments, topic filters
    │   ├── meetups.js            → Nearby Meetups: distance, host/edit/cancel, join/leave, attendees
    │   ├── messages.js           → Messages: conversations, live updates, unread counts
    │   ├── tutorial.js           → first-time tour (saved in profiles.tutorial_completed)
    │   └── chatbot.js            → Nono assistant (also searches classes: "find guitar classes")
    ├── screens/
    │   ├── auth/                 → login, signup, verify, reset-password, role-select, location
    │   ├── instructor/           → educator dashboard, add/edit class, recorded lectures
    │   └── user/                 → learner pages (course.html = class details;
    │                                 nearby-meetups.html + messages.html are shared by both roles)
    └── styles/
```

## Database notes for developers

- **Profiles privacy:** other users can't read `email`, `latitude` or `longitude`.
  Always list columns in `.select(...)` on `profiles` (never `"*"`).
  Read your own full profile with `supabaseClient.rpc("get_my_profile")`.
- **Publishing a class:** `supabaseClient.rpc("publish_course", { p_course, p_lessons, p_lectures })`
  saves the course, lessons and YouTube lectures in one step — if any part fails, nothing is saved.
- **Course visibility:** learners only see published courses (plus ones they're enrolled in);
  educators always see their own drafts.
- No persistent data lives in `localStorage`; Supabase is the source of truth.
- **Photos:** Supabase Storage buckets `avatars` (2 MB) and `course-images` (5 MB), created by
  `database.sql`, plus `social-posts` (5 MB) for Socials photos. Files go in `<user id>/…`;
  users can only change files in their own folder.
- **Private settings:** `profiles.settings` (JSON) is only readable by its owner (via `get_my_profile`).
- **Cache busting:** every page loads local scripts/styles as `file.js?v=N`. When you ship an update,
  bump N everywhere (search & replace e.g. `?v=11` → `?v=12`) and `HN_VERSION` in courses.js so browsers fetch the new files.
- **Self-test:** log in, open `src/screens/selftest.html`, click Run — checks each feature against Supabase.
- **Meetups:** anyone logged in can see and host meetups; only the host can edit or cancel one.
  Capacity is enforced in the database, you can't join a meetup that has started, and only the
  host sees who's going (others only see the number, via `meetup_counts`).
  Distances are worked out in the browser from your saved location — it's never shared.
  "Find this address" uses the free OpenStreetMap lookup (only the venue text is sent).
- **Messages:** you can message your educator ↔ students, meetup host ↔ attendees, or anyone who
  messaged you first (`can_message` in the database). Messages can't be edited or deleted;
  receivers can only mark them read. `my_contacts()` lists who you can start a chat with.
  Open a chat directly with `messages.html?to=<user id>`.
- **Live messages:** `database.sql` adds `messages` to Supabase Realtime. If that's off, the page
  quietly checks for new messages every 5 seconds instead.
- **Unread badge:** `guard.js` shows the unread count next to every Messages link, a banner on both
  dashboards, and a pop-up on any page when a message arrives.
- **Live sessions → inbox:** when an educator schedules (or cancels) a session for a class, a database
  trigger puts a "Live session notice" (with the join link) into every enrolled learner's Messages.
  `messages.kind` is `'text'` for people's messages and `'session'` for these notices (people can't send those).
- **Message the whole class:** Educator dashboard → a class → Manage → "Message all N students".
- **Links:** only `https://` links are accepted for meeting links, photos and class images, both in
  the forms and in the database (`HN.safeUrl` on the frontend; check constraints in `database.sql`).
- **Logged-out visitors** can't read any table or call any app function.
- **Supabase library** is pinned to one tested version (`@supabase/supabase-js@2.117.2`) with an
  integrity hash, so the CDN can't serve a changed file. To upgrade, change the version and hash on
  every page together.
- **Passwords:** at least 8 characters (signup, reset, change password).

## Status

Connected to Supabase:
- Auth: signup, email verification, login, logout, forgot/reset password, change password
- Onboarding (role + location), first-time tutorial
- Profiles: learner + educator profile editing, profile photos, private settings
- Educators: publish (with class image), edit, unpublish and delete classes; students list with progress;
  completion analytics; recent activity; schedule live sessions; recorded-lectures library; ratings
- Learners: Explore (search, categories, ratings), class page with YouTube lectures, enroll / leave,
  tick off lessons, reviews, My Courses, My Progress (overall %, streak), Saved, Schedule
- First lecture of each class is a free preview; the rest unlock after enrolling (enforced in the database)
- Class capacity is enforced in the database; only enrolled learners can review
- Socials: shared feed with photo posts, topics, likes, comments (authors can moderate comments
  on their own posts), "My interests" filter, share links, load more
- Nearby Meetups: meetups sorted by distance, distance + category filters, host / edit / cancel,
  join / leave, spots left, attendee list for hosts, "I'm going" list (also on Saved → Activities)
- Messages (learners and educators): conversations, start a chat with your educator / students /
  meetup people, live updates, read status, unread badges; "Message the educator" on class pages
  and "Message" in the educator's student details

- Launch: security pass, demo data removed, security headers, optional starter catalog
  (`seed-demo.sql`) with real YouTube lessons in every category

## Starter catalog (optional)

`seed-demo.sql` adds 6 sample educators (fictional, no password — nobody can log in as them),
21 published classes across all 7 categories with lessons and 42 real YouTube lectures (credited to
their channels), and 5 upcoming meetups in Mumbai. Run it after `database.sql`; it's safe to re-run
(it also moves past meetups to new upcoming dates). Run `remove-demo.sql` to delete all of it —
real users and their content are not touched.

## Going live (Netlify)

1. **Deploy:** go to app.netlify.com → Add new site → **Deploy manually**, and drag the whole
   `hobbynest` folder in. You get an address like `https://something.netlify.app`
   (rename it under Site configuration → Change site name). To update later, open the site's
   **Deploys** tab and drag the folder in again.
2. **Supabase URLs:** Authentication → URL Configuration → set **Site URL** to your Netlify address
   and add `https://your-site.netlify.app/**` under **Redirect URLs** (keep the Live Server one too
   if you still test locally).
3. **Emails (custom SMTP):** Supabase's built-in sender only allows a few emails an hour, so sign-up
   and password-reset emails will fail with real users. Create an account with an email provider
   (e.g. Resend, Brevo or Postmark), then in Supabase open **Authentication → Emails → SMTP Settings**
   (older dashboards: Project Settings → Authentication), turn on custom SMTP and paste the host,
   port, username and password they give you, plus a sender like `no-reply@yourdomain`.
   Then turn **Confirm email** back on (Authentication → Sign In / Providers → Email) and set the
   minimum password length there to 8.
4. **Check:** open the site, sign up with a real email, click the link, finish onboarding, then open
   `src/screens/selftest.html` and click Run.
5. **Custom domain (optional):** Netlify → Domain management. Afterwards update the Supabase URLs
   from step 2.

The security headers in `_headers` allow only the services the app uses (this Supabase project,
the jsDelivr CDN, YouTube, Unsplash, OpenStreetMap). If you switch to another Supabase project,
update the two `supabase.co` addresses there too.

## Supabase settings checklist

- Authentication → URL Configuration: **Site URL** = your app address, and the same address
  with `/**` under **Redirect URLs** (needed for verification and password-reset links).
- Database → Publications → `supabase_realtime` should include `messages` (database.sql does this;
  `supabase-check.sql` shows it). Without it, messages still work — they just refresh every few seconds.
- The built-in email sender only allows a few emails per hour. For testing you can turn off
  Authentication → Sign In / Providers → Email → **Confirm email**; before launch, add custom SMTP
  (see "Going live").


## Demo content (educators and classes)

After running `database.sql`, open **Supabase Dashboard → SQL Editor**, paste the contents of `seed-demo.sql`, and run it. It adds six fictional demo educator profiles, sample classes/lessons/lectures, and upcoming meetups. The demo educators use reserved `.example` emails and have no usable passwords, so they are showcase profiles, not login accounts. Run `remove-demo.sql` only if you want to remove the demo content.

## Emails, verification and account deletion (Batch 8)

### What was fixed
| Problem | Cause | Fix |
|---|---|---|
| Verification link "doesn't open any page" / shows an error | Supabase sends people to the **Site URL** when the redirect isn't on the allow-list (often `localhost`); email scanners (Gmail/Outlook) "click" links first, which uses them up → `otp_expired`; the login page ignored the error | New `verify.html` page handles every kind of link, explains expired/used links and offers "send a new link"; `index.html`, `404.html` and `login.html` forward stray links to it; new email template only verifies when the person clicks |
| No intimation of registration | Signup ended with a browser `alert()`; an already-registered email silently got no mail | "Check your inbox" screen with resend + "Registration complete" page + **welcome email** |
| Account deletion not working | Tables created before `database.sql` keep old foreign keys without `ON DELETE CASCADE`, so Supabase refuses ("Database error deleting user"); it also needed a separately deployed Edge Function; educators had no delete option | `database.sql` §13 rebuilds those keys, §14 adds `delete_my_account()` (no deploy needed); clearer errors; delete for educators too; photos removed |
| Deletion not communicated | Nothing told the user | "Your account has been permanently deleted" on the login page + confirmation **email** (EmailJS, optional) |
| Educator's message / scheduled call not seen by the learner | Messages only showed on the Messages page; scheduling a session sent nothing; testing two accounts in one browser silently switched both tabs to the second account, so sends were rejected | Session notices go straight into learners' inboxes (trigger), unread banner + pop-ups on every page, "Message all students", tabs reload when the account changes (emails for messages: advanced, optional) |

> **Testing tip:** Supabase keeps one login per browser. To test educator ↔ learner, use two different
> browsers (or one normal + one private/incognito window) — not two tabs of the same window.

### One-time setup — see **SUPABASE-SETUP.txt** (step by step, ~10 minutes)
1. Run the latest `database.sql` (fixes deletion + adds session notices + `delete_my_account()`).
2. Authentication → URL Configuration: Site URL + Redirect URLs = your Netlify address (fixes the verification link).
3. Confirm email ON, paste `email-templates/confirm-signup.html` as the "Confirm signup" template, optional Gmail SMTP.
4. Optional: EmailJS keys in `src/js/email-config.js` → welcome + "account deleted" emails (no server needed).
5. Upload the new folder to Netlify, Ctrl+Shift+R, then run `src/screens/selftest.html`.

Account deletion works with **just database.sql**: the app removes the user's photos, then calls
`supabaseClient.rpc("delete_my_account")`, which deletes only the logged-in user (everything else
cascades). Messages keep working even before database.sql is updated (session notices need the update).

### Advanced: Edge Functions (optional, not needed for the demo)
`supabase/functions/notify` adds emails for new messages and live sessions; `supabase/functions/delete-account`
is a server-side alternative to `delete_my_account()`. Deploy with the Supabase CLI, then set
`edgeFunctions: true` in `src/js/email-config.js`:
```bash
supabase login
supabase link --project-ref jrxlhqxphtnhtugaetfw
supabase functions deploy delete-account
supabase functions deploy notify
supabase secrets set RESEND_API_KEY=re_xxx EMAIL_FROM="HobbyNest <no-reply@yourdomain.com>" APP_URL=https://your-site.netlify.app
```

#### Advanced: email people deleted from the Supabase dashboard
Accounts deleted by an admin in Authentication → Users can also get the confirmation email:
Database → Webhooks → Create → table `profiles`, event **Delete**, type **Supabase Edge Functions**, function `notify`
(it sends the service key in the `Authorization` header). Each person still gets only one deletion email.

### Notification settings respected
- Learners: Settings → "Message emails" (new messages) and "Schedule updates" (new sessions).
- Educators: Settings → Email notifications ("None" / "Only session reminders" turn message emails off).
- One email per conversation burst (10 minutes), and `public.email_log` makes sure nothing is sent twice.

## UI polish release

This release adds consistent focus-visible keyboard states, reduced-motion support, smoother card/button interactions, improved form focus feedback, responsive spacing, and clearer toast styling. Explore includes a clear-search action and a retry state when class loading fails. Nono supports clearing the conversation, keyboard send (Enter) and multiline input (Shift+Enter).


## UI polish update (v10)
- Meetup category cards and meetup details use category-specific photographs instead of emoji artwork.
- The top-bar account name/avatar is clickable and opens the learner profile or educator profile section.
- Improved shared button/focus styles, meetup field-level validation, duplicate-submit prevention, responsive meetup cards and descriptive image alt text.
- The existing Supabase row-level security policies in `database.sql` enforce ownership for meetup creation/editing/deletion and registration actions. Apply the latest `database.sql` to the connected Supabase project if its policies are not up to date.


## Dashboard updates (v13)
- Instructor greeting now uses the signed-in educator's saved profile name.
- Course-specific sessions create a join URL when no external meeting link is supplied and write inbox notices for enrolled learners through the database session trigger. Email reminders still require the deployed `notify` Edge Function and email provider configuration.
- Educators have a dedicated profile page at `src/screens/instructor/profile.html`.
- Student and instructor dashboards include a shared OpenStreetMap view of upcoming meetups that have saved coordinates.
- Recorded lecture styling uses the existing blue/pink HobbyNest palette.
