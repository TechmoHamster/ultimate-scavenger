# SPEC.md — Proposal Scavenger Hunt Website

## 1) Goal
Build a mobile-first, interactive scavenger hunt website that supports a real-world, envelope-based clue hunt culminating in a proposal.

The website:
- Tracks player progress
- Verifies physical presence via GPS
- Manages a hint economy
- Guides the player step-by-step
- Ends by launching Google Maps to the proposal location
- Allows the creator (Zach) to monitor progress and receive SMS notifications

---

## 2) Users & Roles

### Player (Erika)
- Creates an account at the start (Step 0)
- Solves clues by visiting physical locations
- Uses the website to:
  - view current clue
  - buy hints with in-game currency
  - unlock next clues via password + geo verification

### Admin (Zach)
- Logs into an admin dashboard
- Views player progress in real time
- Modifies steps, hints, geo settings
- Receives SMS notifications when clues are completed

---

## 3) Scavenger Hunt Workflow

### Step 0 — Account Creation + Intro (QR #1)
- Player scans the first QR code
- Website prompts player to **create an account**
- After account creation:
  - wallet is initialized
  - scavenger hunt begins
- Step 0:
  - NOT password protected
  - Displays first clue
  - Allows hint purchases

---

### Steps 1–7 — Location-Gated Clues (QR #2–#8)
For each step:
1) Player finds envelope at physical location
2) Scans QR code for that step
3) Website prompts:
   - Enter password (location name)
   - Allow location access
4) Website validates:
   - password correctness
   - player is within allowed GPS radius
5) On success:
   - step is marked complete
   - currency is awarded
   - next clue is revealed
   - admin is notified via SMS

Hints can be purchased at any time for that step.

---

### Final Step — Destination Reveal (QR #9)
- Works like previous steps (password + geo verification)
- On success:
  - displays a congratulatory message
  - shows a button: **“Go to Your Final Destination”**
- Tapping the button opens Google Maps with coordinates and directions to the proposal location

---

## 4) Hint Economy

- Player has a wallet with a starting balance
- Each completed step awards currency
- Each step may define 0–N hints
- Each hint has:
  - cost
  - text
- Purchased hints remain permanently visible

---

## 5) Geo Verification Rules
- Location-gated steps require GPS verification
- Each step defines:
  - center latitude/longitude
  - radius in meters
- Unlock requires:
  - password match
  - distance ≤ radius
- UX must:
  - show distance feedback if too far
  - allow retry

---

## 6) Notifications
- When a step is successfully completed:
  - Admin receives an SMS notification
- Optional notifications:
  - Final destination unlocked
  - Final destination opened

---

## 7) Admin Capabilities
Admin can:
- Log in securely
- View live player progress
- See completion timestamps
- Edit:
  - clue text
  - hint text + costs
  - geo coordinates + radius
- Force unlock steps
- Reset progress or wallet

---

## 8) Acceptance Criteria
- Account creation required before play
- QR + password + geo verification works reliably
- Progress persists across refreshes
- Admin dashboard updates in real time
- SMS notifications send on step completion
- Final step launches Google Maps correctly