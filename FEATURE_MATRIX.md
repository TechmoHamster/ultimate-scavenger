# FEATURE_MATRIX.md — Proposal Scavenger Hunt

## Core Gameplay

| Feature | Tech | Scope |
|------|------|------|
| Account Creation | Supabase Auth | Step 0 |
| Step Engine | Next.js + TS | Global |
| QR Step Entry | URL Routing | Entry |
| Progress Tracking | Supabase DB | Global |

---

## Unlock & Validation

| Feature | Tech | Scope |
|------|------|------|
| Password Unlock | Client Logic | Steps 1–Final |
| Geo Verification | Geolocation API | Steps 1–Final |
| Distance Calculation | Haversine Formula | Steps 1–Final |
| Retry Feedback | UI + Geo | Per Step |

---

## Hint Economy

| Feature | Tech | Scope |
|------|------|------|
| Wallet | Supabase DB | Global |
| Earn Currency | Step Engine | Per Step |
| Buy Hint | DB + UI | Per Step |
| Persistent Hints | DB | Per Step |

---

## Admin & Monitoring

| Feature | Tech | Scope |
|------|------|------|
| Admin Login | Supabase Auth | Admin |
| Live Progress View | Supabase Realtime | Admin |
| Builder Controls | Admin UI | Admin |
| Force Actions | Serverless | Admin |

---

## Notifications

| Feature | Tech | Scope |
|------|------|------|
| Step Completion SMS | Twilio + Serverless | Admin |
| Final Destination Alert | Twilio | Admin |

---

## Final Reveal

| Feature | Tech | Scope |
|------|------|------|
| Google Maps Launch | Maps Deep Link | Final |
| Directions Mode | Google Maps | Final |
| Cinematic Message | Framer Motion | Final |

---

## Reliability & UX

| Feature | Tech | Scope |
|------|------|------|
| Resume After Close | DB Sync | Global |
| Offline Resilience | Service Worker (opt) | Global |
| Graceful Failures | UI Guards | Global |