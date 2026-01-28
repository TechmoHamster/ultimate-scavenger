# ARCHITECTURE.md — Proposal Scavenger Hunt System

## 1) System Overview

This system consists of:
- A static frontend web app
- A backend for auth, persistence, admin tools, and notifications
- External integrations for maps and SMS

---

## 2) Frontend Stack
- Next.js (App Router, static-first)
- TypeScript
- Tailwind CSS
- Framer Motion
- Web APIs:
  - Geolocation
  - Fullscreen
  - Web Audio (optional)
  - Web Share (optional)

---

## 3) Backend Stack
- Supabase:
  - Authentication
  - PostgreSQL database
  - Realtime subscriptions
- Serverless Functions (Next.js / Netlify / Vercel):
  - SMS notifications
  - Admin actions
- Twilio:
  - SMS delivery

---

## 4) Authentication
- Player:
  - standard email + password OR magic link
- Admin:
  - separate role flag
- Role-based access enforced via Supabase RLS

---

## 5) Database Schema

### player_state
- player_id (PK)
- current_step_id
- wallet_balance
- created_at
- updated_at

### step_completions
- id
- player_id
- step_id
- completed_at
- geo_lat
- geo_lng
- distance_meters

### hint_purchases
- id
- player_id
- step_id
- hint_id
- cost
- purchased_at

### experience_config
- id
- json_config
- updated_at

### events
- id
- type
- player_id
- step_id
- created_at
- payload_json

---

## 6) Realtime Updates
- Admin dashboard subscribes to:
  - player_state
  - step_completions
- UI updates instantly on completion

---

## 7) Step Unlock Logic
On unlock attempt:
1) Validate password
2) Request GPS
3) Calculate distance (Haversine)
4) If valid:
   - write step_completions row
   - update player_state
   - emit event
   - trigger SMS notification

---

## 8) SMS Flow
- Step completion triggers serverless function
- Function sends SMS via Twilio
- Secrets stored server-side only

---

## 9) Routing

### Player
- `/` → account creation / resume
- `/experience?step=id`
- `/final`

### Admin
- `/admin/login`
- `/admin/dashboard`
- `/admin/builder`

---

## 10) Security
- Supabase RLS:
  - players access only their data
  - admin can access all data
- No secrets exposed to client