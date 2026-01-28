export type Hint = {
  id: string;
  cost: number;
  text: string;
};

export type Step = {
  id: number;
  label: string;
  title: string;
  clue: string;
  password?: string;
  reward: number;
  radiusMeters?: number;
  coords?: {
    lat: number;
    lng: number;
  };
  hints: Hint[];
  isFinal?: boolean;
};

export const steps: Step[] = [
  {
    id: 0,
    label: "Intro",
    title: "The Opening Envelope",
    clue:
      "Welcome to the hunt. Your first clue lives in the place where we first promised to chase big dreams together. Open the next envelope when you're ready.",
    reward: 20,
    hints: [
      {
        id: "0-a",
        cost: 4,
        text: "It smells like espresso and impossible ideas.",
      },
      {
        id: "0-b",
        cost: 6,
        text: "We sketched plans on napkins here.",
      },
    ],
  },
  {
    id: 1,
    label: "Clue 1",
    title: "City of Firsts",
    clue:
      "Find the place where we celebrated your boldest leap. The password is the exact name on the sign outside.",
    password: "PLACEHOLDER_ONE",
    reward: 25,
    radiusMeters: 120,
    coords: { lat: 40.741895, lng: -73.989308 },
    hints: [
      {
        id: "1-a",
        cost: 6,
        text: "We toasted with something sparkling.",
      },
      {
        id: "1-b",
        cost: 9,
        text: "Look for the skyline view.",
      },
    ],
  },
  {
    id: 2,
    label: "Clue 2",
    title: "Hidden in Plain Sight",
    clue:
      "The next envelope is waiting where we ran from the rain and ended up laughing the whole time.",
    password: "PLACEHOLDER_TWO",
    reward: 25,
    radiusMeters: 120,
    coords: { lat: 40.73061, lng: -73.935242 },
    hints: [
      {
        id: "2-a",
        cost: 5,
        text: "Your favorite corner booth lives here.",
      },
      {
        id: "2-b",
        cost: 8,
        text: "There's neon in the window.",
      },
    ],
  },
  {
    id: 3,
    label: "Clue 3",
    title: "The Quiet Garden",
    clue:
      "Seek the calmest pocket of the city where we planned our next adventure.",
    password: "PLACEHOLDER_THREE",
    reward: 30,
    radiusMeters: 140,
    coords: { lat: 40.7829, lng: -73.9654 },
    hints: [
      {
        id: "3-a",
        cost: 7,
        text: "It's surrounded by tall trees.",
      },
      {
        id: "3-b",
        cost: 10,
        text: "Look for the stone arch.",
      },
    ],
  },
  {
    id: 4,
    label: "Clue 4",
    title: "North Star",
    clue:
      "The next password is hidden inside the place we always said felt like a portal.",
    password: "PLACEHOLDER_FOUR",
    reward: 30,
    radiusMeters: 130,
    coords: { lat: 40.752726, lng: -73.977229 },
    hints: [
      {
        id: "4-a",
        cost: 8,
        text: "Travelers pass through here all day.",
      },
      {
        id: "4-b",
        cost: 12,
        text: "The ceiling is famous.",
      },
    ],
  },
  {
    id: 5,
    label: "Clue 5",
    title: "The Detour",
    clue:
      "Return to the spot where we got lost and found something better.",
    password: "PLACEHOLDER_FIVE",
    reward: 35,
    radiusMeters: 150,
    coords: { lat: 40.758896, lng: -73.98513 },
    hints: [
      {
        id: "5-a",
        cost: 9,
        text: "Bright lights, big energy.",
      },
      {
        id: "5-b",
        cost: 12,
        text: "A crowd always gathers here.",
      },
    ],
  },
  {
    id: 6,
    label: "Clue 6",
    title: "Golden Hour",
    clue:
      "The next envelope waits where the light hits the water just right.",
    password: "PLACEHOLDER_SIX",
    reward: 35,
    radiusMeters: 150,
    coords: { lat: 40.700292, lng: -74.017134 },
    hints: [
      {
        id: "6-a",
        cost: 9,
        text: "Listen for ferry horns.",
      },
      {
        id: "6-b",
        cost: 12,
        text: "You can see the statue from here.",
      },
    ],
  },
  {
    id: 7,
    label: "Clue 7",
    title: "The Last Envelope",
    clue:
      "One more stop. The password is the word we always write at the end of our notes.",
    password: "PLACEHOLDER_SEVEN",
    reward: 40,
    radiusMeters: 120,
    coords: { lat: 40.761581, lng: -73.98055 },
    hints: [
      {
        id: "7-a",
        cost: 10,
        text: "We bought tickets here once.",
      },
      {
        id: "7-b",
        cost: 14,
        text: "Look up to the marquee.",
      },
    ],
  },
  {
    id: 8,
    label: "Final Clue",
    title: "Destination Reveal",
    clue:
      "You've done it. Enter the final password and the map will guide you to the place where the next chapter begins.",
    password: "PLACEHOLDER_FINAL",
    reward: 0,
    radiusMeters: 120,
    coords: { lat: 40.748817, lng: -73.985428 },
    hints: [
      {
        id: "8-a",
        cost: 0,
        text: "This is the one you've been waiting for.",
      },
    ],
    isFinal: true,
  },
];

export const FINAL_DESTINATION = {
  lat: 40.32558,
  lng: -111.762521,
};
