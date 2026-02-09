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
  requiresUnlock?: boolean;
  requiresPassword?: boolean;
  requiresGps?: boolean;
  requiresArtifact?: boolean;
  hintsEnabled?: boolean;
  hintLimit?: number;
  cooldownEnabled?: boolean;
  cooldownMinutes?: number;
};

export const steps: Step[] = [
  {
    id: 0,
    label: "Intro",
    title: "The Opening Envelope",
    clue:
      "Welcome to the hunt. Your first clue lives in the place where we first promised to chase big dreams together. Open the next envelope when you're ready.",
    reward: 20,
    requiresUnlock: false,
    requiresPassword: false,
    requiresGps: false,
    requiresArtifact: false,
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
    title: "Where It All Began",
    clue:
      "Find the place where we celebrated your boldest leap. The password is the exact name on the sign outside.",
    password: "Zupas Cafe",
    reward: 25,
    radiusMeters: 120,
    coords: { lat: 40.4341704311097, lng: -111.894641025989 },
    hints: [
      {
        id: "1-a",
        cost: 5,
        text: "Think food… and our first date.",
      },
      {
        id: "1-b",
        cost: 8,
        text: "Soups, sandwiches, and salads.",
      },
    ],
  },
  {
    id: 2,
    label: "Clue 2",
    title: "So Close to Freedom",
    clue:
      "The next envelope is waiting where we ran from the rain and ended up laughing the whole time.",
    password: "Secret Combinations Escape Room",
    reward: 25,
    radiusMeters: 120,
    coords: { lat: 40.378592, lng: -111.795791 },
    hints: [
      {
        id: "2-a",
        cost: 5,
        text: "A place full interict puzzles and codes —all contained in a single room.",
      },
      {
        id: "2-b",
        cost: 9,
        text: "Check out the freebie hint, there are two important words in there.",
      },
      {
        id: "2-c",
        cost: 15,
        text: "An escape room in American Fork called Secret Combinations.",
      },
    ],
  },
  {
    id: 3,
    label: "Clue 3",
    title: "Hidden Beneath the Mountain",
    clue:
      "Seek the calmest pocket of the city where we planned our next adventure.",
    password: "Timpanogos Caves",
    reward: 30,
    radiusMeters: 140,
    coords: { lat: 40.426138, lng: -111.776772 },
    hints: [
      {
        id: "3-a",
        cost: 5,
        text: "It's surrounded by tall trees and tucked away in the mouth of the mountain.",
      },
      {
        id: "3-b",
        cost: 9,
        text: "Tunnels that contain natures hidden beauty away from the light.",
      },
    ],
  },
  {
    id: 4,
    label: "Clue 4",
    title: "Paws, Play, and Everyday Joy",
    clue:
      "The next password is hidden inside the place we always said felt like a portal.",
    password: "Art Dye Dog Park",
    reward: 30,
    radiusMeters: 120,
    coords: { lat: 40.399422, lng: -111.782995 },
    hints: [
      {
        id: "4-a",
        cost: 8,
        text: "Where the dogs drink… and splash.",
      },
      {
        id: "4-b",
        cost: 12,
        text: "Bear loves to burry her head and go scubadiving here.",
      },
    ],
  },
  {
    id: 5,
    label: "Clue 5",
    title: "The Daily Detour",
    clue:
      "Return to the spot where we got lost and found something better.",
    password: "Dutch Bros",
    reward: 35,
    radiusMeters: 120,
    coords: { lat: 40.3589468, lng: -111.7636648 },
    hints: [
      {
        id: "5-a",
        cost: 9,
        text: "Coffee, energy drinks, and daily stops.",
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
    title: "Planned with Care",
    clue:
      "The next envelope waits where the light hits the water just right.",
    password: "Flower Patch",
    reward: 35,
    radiusMeters: 120,
    coords: { lat: 40.2522764, lng: -111.6680086 },
    hints: [
      {
        id: "6-a",
        cost: 6,
        text: "Your favorite flower shop.",
      },
      {
        id: "6-b",
        cost: 12,
        text: "Does provo peaks have patch of flowers?",
      },
    ],
  },
  {
    id: 7,
    label: "Clue 7",
    title: "The Moment Everything Shifted",
    clue:
      "One more stop. The password is the word we always write at the end of our notes.",
    password: "The Rush Funplex",
    reward: 40,
    radiusMeters: 120,
    coords: { lat: 40.2762577936988, lng: -111.679981094798 },
    hints: [
      {
        id: "7-a",
        cost: 10,
        text: "We went here for bowling and miniture golf.",
      },
      {
        id: "7-b",
        cost: 14,
        text: "I hear there is a 'rush' at the univeristy mall in Orem.",
      },
    ],
  },
  {
    id: 8,
    label: "Final Clue",
    title: "The Big One",
    clue:
      "You've done it. Enter the final password and the map will guide you to the place where the next chapter begins.",
    reward: 0,
    requiresUnlock: false,
    requiresPassword: false,
    requiresGps: false,
    requiresArtifact: false,
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
