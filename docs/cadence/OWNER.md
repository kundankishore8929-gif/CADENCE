# CADENCE for the gym owner

Your gym's app, at your gym's address (for example `https://gym.yourdomain.com`). The server is
set up with `deploy/pilot/README.md`. This page is the first day after that: about 30 minutes.

## First day (30 minutes)
1. **Create your profile first.** Open the address and create a profile: the first one is the
   owner. You get the **Gym** card on Home and the admin page in Settings.
2. **Your gym's look.** Home → Gym → gear icon → **Gym settings**: name, logo, colour, country
   code (91 for India). Members see it on the sign-in screen and in the app.
3. **Your trainers.** Each trainer creates a profile. Then admin page → tap the trainer →
   **Make trainer**. They get a code like `AMAN01` to give their clients.
4. **The desk screen.** Admin page → **Front desk check-in** → **Set up desk screen** → open the
   link on a tablet or laptop at reception, full screen, and leave it on.
5. **Tell members.** A poster or WhatsApp message with the address and three lines: create a
   profile, scan the code at the desk, enter your trainer's code under Settings → My trainer.

## Every day: Home → Gym
- **Today**: who checked in, who is training now, PT sessions counted, flagged sessions to
  settle (**Keep** if it happened, **Remove** to give the member the session back).
- **Members**: Slipping (8–14 days away), At risk (15–30), Lost (over 30). **WhatsApp** opens a
  ready message to edit and send. Add a member's phone number once (**Add phone**).
- **Trainers**: each one's clients, PT sessions this month, client consistency, and how many of
  last month's clients they kept.
- **Check-ins**: visits per day, and the busy hours.

## PT packages (front desk)
Admin page → tap a member → **Add PT package**: sessions, start, how long it is valid. The
member's trainer counts each session; the member can flag one that wasn't them within 48 hours.
Counts only: CADENCE takes no payments.

## Good to know
- **Who sees what.** A trainer sees only the members who chose to share with them, and only
  their training: never photos, videos or their own notes. You and the front desk see members'
  workouts in the admin page, never their photos, videos or notes. A trainer's notes are theirs
  alone; you don't see them either. `PRIVACY.md` has the full list to give members.
- **Exercise pictures.** CADENCE shows each exercise's muscles instead of a picture: the
  pictures openGym uses are licensed to openGym only.
- **Backups** run every night on the server (`deploy/pilot/backup.sh`). Download one a week.
