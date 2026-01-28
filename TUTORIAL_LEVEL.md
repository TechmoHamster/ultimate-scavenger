# TUTORIAL_LEVEL.md — Scavenger Hunt Tutorial Level

## Purpose
The Tutorial Level introduces new players to the scavenger hunt website and teaches them how the game works before they begin the real hunt.

The tutorial is designed to:
- Orient the player to the interface
- Explain the core gameplay mechanics
- Provide a safe, hands-on demo
- Build confidence before Clue 1
- Reward completion with a tutorial badge

---

## When the Tutorial Runs
- The tutorial runs automatically for new accounts
- It appears after account creation and before Clue 1
- It runs only once per account unless reset by an admin

### Trigger Condition
if (account.isNew === true && tutorial.completed === false)
→ launch tutorial

---

## Tutorial Mode Rules
- Tutorial runs in sandbox mode
- No real clues, locations, wallet balance, or progress are affected
- GPS checks are simulated and always succeed
- Tutorial data is isolated from the real game state

Feature flag:
isTutorialMode = true

---

## Tutorial Structure
The tutorial is broken into three sequential phases:

1. Orientation — Learn the interface
2. How the Game Works — Learn the rules
3. Interactive Demo — Practice the gameplay loop

A progress indicator should display:
Tutorial • Step X of Y

---

## Phase 1 — Orientation (UI Walkthrough)

### Goal
Help the player understand where everything is and what each part of the site does.

### UI Elements to Highlight
- Menu button
- Profile page
- Wallet / credit balance
- Progress tracker
- Current clue panel
- Hint button

### Behavior
- Highlight one UI element at a time
- Show a tooltip explaining its purpose
- Player taps Next to continue

---

## Phase 2 — How the Game Works (Explanation)

### Goal
Explain the scavenger hunt mechanics clearly.

### Topics Covered
- Scanning QR codes to open clue pages
- Unlocking clues by entering a password (location name)
- GPS verification to confirm the player is at the correct place
- Buying hints using in-game credits
- Automatic progress saving

---

## Phase 3 — Interactive Demo (Hands-On Practice)

### Demo Setup
- Sandbox wallet balance: 10 credits
- Demo password: tutorial park
- GPS verification simulated

### Demo Actions
1. Player purchases a hint
2. Wallet balance updates visually
3. Player enters demo password
4. Clue unlocks successfully
5. Progress tracker updates

---

## Tutorial Completion

### Completion Criteria
- All demo actions completed
- Player taps Finish Tutorial

### On Completion
tutorial.completed = true
tutorial.completedAt = timestamp

Award badge:
- ID: tutorial-complete
- Name: Ready to Hunt
- Description: Completed the scavenger hunt tutorial

---

## Transition to Game
- Display confirmation message
- Unlock Clue 1
- Route player to live scavenger hunt

---

## Skipping the Tutorial
- Tutorial can be skipped with confirmation
- Skipping marks tutorial as completed
- Skipping does not award the badge
- Tutorial remains accessible via Help menu

---

## Admin Controls
Admins can:
- Reset tutorial completion
- Force tutorial replay
- Enter tutorial mode directly

---

## Success Criteria
- Player understands navigation
- Player understands unlocking clues
- Player understands hints and credits
- Player completes a demo unlock
- Player begins Clue 1 with confidence
