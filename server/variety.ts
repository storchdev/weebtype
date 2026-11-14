// Variety for LLM passages. A numeric "seed" in the prompt does nothing: the model
// ignores it and keeps falling back on its favourite topics (cafés, cherry blossoms,
// "today the weather is…"). Instead the server picks concrete, different directions
// (subject × form × narrator × tone) from shuffle bags, so no subject repeats until
// the whole pool is used, and tells the model what the last passages were about.

export type Rng = () => number;

const SUBJECTS = [
  "a lost umbrella at a train station",
  "fixing a bicycle chain",
  "a neighbourhood festival's goldfish scooping stall",
  "an old bookshop closing down",
  "learning to make miso soup from a grandparent",
  "a night shift at a convenience store",
  "a first day at a new job",
  "a cat that visits a different house every day",
  "climbing Mount Fuji at night",
  "a broken washing machine",
  "a school sports day relay",
  "a typhoon cancelling plans",
  "sorting garbage correctly",
  "a public bath (sentō) in winter",
  "a train delayed by snow",
  "a ramen shop with a strict owner",
  "planting rice in spring",
  "a lighthouse keeper",
  "moving into a tiny apartment",
  "a karaoke night gone wrong",
  "a forgotten birthday",
  "a fisherman's early morning",
  "a lost wallet returned by a stranger",
  "a calligraphy lesson",
  "a power outage in summer",
  "a hospital waiting room",
  "a long-distance phone call",
  "a robot vacuum that gets stuck",
  "a mountain village with one bus a day",
  "a library's strange returned book",
  "a pottery class",
  "a job interview",
  "a ferry ride between islands",
  "an earthquake drill at school",
  "a vending machine that gives two drinks",
  "a café run by an elderly couple",
  "a marathon runner's last kilometre",
  "a wedding speech",
  "a farmer and a crow",
  "repairing an old clock",
  "a snow festival sculpture",
  "a stray dog at a shrine",
  "a night market",
  "a scientist observing fireflies",
  "a delivery driver's route",
  "a misunderstanding over text messages",
  "a haunted-house attraction",
  "a tea ceremony mistake",
  "a baseball game in the rain",
  "a piano recital",
  "a kid's first errand alone",
  "a beekeeper",
  "an astronaut looking at Earth",
  "a samurai's last letter",
  "a village legend about a fox",
  "a detective finding a clue",
  "a cooking contest",
  "a long queue for a new game",
  "a translator's difficult word",
  "a museum guard at closing time",
  "a wind chime shop",
  "a train driver's retirement",
  "a hot-spring inn in the mountains",
  "a garden in autumn",
  "an apology letter",
  "a broken smartphone screen",
  "a sumo wrestler's breakfast",
  "a weekend camping trip",
  "renting a kimono for a day",
  "a dentist appointment",
  "a hairdresser's regular customer",
  "a mysterious package",
  "a lost child at a department store",
  "a carpenter building a temple gate",
  "a high-school band practice",
  "a bento made too early",
  "a new year's resolution",
  "a moving company mishap",
  "a tsunami warning sign",
  "a deer in Nara stealing a map",
  "an old photograph found in a drawer",
  "a game of shogi in the park",
  "a ninja in a children's play",
  "a heavy snowfall in Hokkaido",
  "a paper crane chain for a friend",
  "a university entrance exam",
  "a local train with wooden seats",
  "a tiny ramen stand under a bridge",
  "a fortune-telling slip at a shrine",
  "a crow stealing a sandwich",
  "an online meeting with a frozen screen",
  "a puppet theatre (bunraku) performance",
  "a flower shop on Valentine's Day",
  "a walk along an old castle moat",
  "making soba noodles by hand",
  "a soccer team losing every game",
  "a pharmacist's busy morning",
  "a raccoon dog (tanuki) in the city",
  "a broken air conditioner in August",
  "a farewell at an airport",
  "an old man feeding pigeons",
  "a street musician",
  "a typhoon-damaged greenhouse",
  "a children's drawing contest",
  "a math teacher's joke",
  "a firefighter's day off",
  "a postal worker on an island",
  "an overdue library book",
  "a manga artist's deadline",
  "a quiet morning at a temple",
  "a cooking failure",
  "a lost key",
  "a power-saving campaign",
  "a surprise party",
  "a vet treating a turtle",
  "a used-clothing store",
  "a kite festival",
  "a cycling trip along the coast",
  "a game centre crane machine",
  "a sake brewery",
  "a recycling factory tour",
  "a child's question about stars",
  "a winter persimmon tree",
  "a typo in an important email",
  "a phone left on a bus",
  "an insect collection",
  "a shared house argument about dishes",
  "a lantern floating festival",
  "a parade float",
  "a bakery at dawn",
] as const;

const FORMS = [
  "a short first-person diary entry",
  "a letter to someone",
  "a short dialogue in 「」 between two people",
  "a little anecdote with a twist at the end",
  "a brief news-style report",
  "a simple step-by-step explanation",
  "a short folk tale",
  "a vivid description of a scene",
  "a short review",
  "an inner monologue",
  "a notice or announcement",
  "a short story told in the third person",
] as const;

const NARRATORS = [
  "a child",
  "a high-school student",
  "an office worker",
  "an elderly person",
  "a shop owner",
  "a tourist",
  "a teacher",
  "a parent",
  "a nurse",
  "a farmer",
  "a cook",
  "a university student",
  "a retiree",
  "a driver",
] as const;

const TONES = [
  "light and funny",
  "nostalgic",
  "matter-of-fact",
  "warm",
  "slightly tense",
  "curious",
  "wistful",
  "cheerful",
  "dry and understated",
  "excited",
] as const;

/** Shuffle bag: every item comes out once (in random order) before any repeats. */
class Bag<T> {
  private queue: T[] = [];
  constructor(
    private readonly items: readonly T[],
    private readonly rng: Rng,
  ) {}
  next(): T {
    if (!this.queue.length) {
      const q = [...this.items];
      for (let i = q.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [q[i], q[j]] = [q[j] as T, q[i] as T];
      }
      this.queue = q;
    }
    return this.queue.pop() as T;
  }
}

export interface Direction {
  subject: string;
  form: string;
  narrator: string;
  tone: string;
}

const RECENT = 8;

export class Variety {
  private readonly subjects: Bag<string>;
  private readonly forms: Bag<string>;
  private readonly narrators: Bag<string>;
  private readonly tones: Bag<string>;
  /** Openings (first sentence, trimmed) of recently generated passages, newest last. */
  private readonly openings: string[] = [];
  private readonly recentSubjects: string[] = [];

  constructor(rng: Rng = Math.random) {
    this.subjects = new Bag(SUBJECTS, rng);
    this.forms = new Bag(FORMS, rng);
    this.narrators = new Bag(NARRATORS, rng);
    this.tones = new Bag(TONES, rng);
  }

  next(): Direction {
    return {
      subject: this.subjects.next(),
      form: this.forms.next(),
      narrator: this.narrators.next(),
      tone: this.tones.next(),
    };
  }

  /** Prompt lines steering this request; `topic` is the user's optional topic. */
  promptLines(d: Direction, topic: string): string[] {
    const lines = topic.trim()
      ? [
          `Topic: ${topic.trim()}. Within it, take an unexpected specific angle, loosely inspired by: ${d.subject}.`,
        ]
      : [`Subject: ${d.subject}.`];
    lines.push(
      `Write it as ${d.form}${d.form.includes("third person") || d.form.includes("news") || d.form.includes("notice") ? "" : `, from the point of view of ${d.narrator}`}; tone: ${d.tone}.`,
      "Use specific names, places, objects and details rather than generic statements.",
    );
    if (this.recentSubjects.length || this.openings.length) {
      lines.push(
        "Recent passages already covered the following, so make this one clearly different in subject, vocabulary and its first sentence:",
        ...this.recentSubjects.map((s) => `- subject: ${s}`),
        ...this.openings.map((o) => `- opened with: ${o}`),
      );
    }
    return lines;
  }

  /** Remember a finished passage so later prompts avoid it. */
  record(d: Direction, text: string): void {
    const first = text.split(/(?<=[。！？])/)[0]?.slice(0, 30) ?? "";
    push(this.recentSubjects, d.subject);
    if (first) push(this.openings, first);
  }
}

function push(list: string[], v: string): void {
  list.push(v);
  if (list.length > RECENT) list.shift();
}
