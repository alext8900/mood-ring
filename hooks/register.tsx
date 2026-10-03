import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, StateDollar, Timer } from 'claude-code'

import type { Activity, LastSession, Ledger, Lifetime, Mood, RepoMemory, Situation, Stats } from '../types'

const DEFAULT_MOOD: Mood = {
  score: 0,
  target: 0,
  quip: null,
  quipUntil: 0,
  quipPriority: 0,
  situation: null,
  situationUntil: 0,
}
const DEFAULT_STATS: Stats = { edits: 0, failures: 0, streak: 0, activity: 'idle' }

const mood = atom({ plugin: 'mood-ring', key: 'mood' } as const, DEFAULT_MOOD)
const frame = atom({ plugin: 'mood-ring', key: 'frame' } as const, 0)
const isHidden = atom({ plugin: 'mood-ring', key: 'isHidden' } as const, false)
const isVerbose = atom({ plugin: 'mood-ring', key: 'isVerbose' } as const, false)
const stats = atom({ plugin: 'mood-ring', key: 'stats' } as const, DEFAULT_STATS)

const DEFAULT_LEDGER: Ledger = {
  turns: 0,
  passes: 0,
  checkFails: 0,
  interrupts: 0,
  bestStreak: 0,
  worstStreak: 0,
  commits: 0,
  pushes: 0,
  forcePushes: 0,
  conflicts: 0,
  incidents: 0,
  low: null,
  high: null,
  situations: {},
}
const DEFAULT_LIFETIME: Lifetime = {
  sessions: 0,
  turns: 0,
  edits: 0,
  failures: 0,
  passes: 0,
  interrupts: 0,
  commits: 0,
  pushes: 0,
  forcePushes: 0,
  conflicts: 0,
  bestStreak: 0,
  worstStreak: 0,
}

const ledger = atom({ plugin: 'mood-ring', key: 'ledger' } as const, DEFAULT_LEDGER)
const timeline = atom({ plugin: 'mood-ring', key: 'timeline' } as const, [])
const isGreeted = atom({ plugin: 'mood-ring', key: 'isGreeted' } as const, false)

const TICK_MS = 350
// How many ticks a quip stays up by default.
const CAPTION_TICKS = 12
// How many ticks each mood line shows before the next one.
const ROTATE_TICKS = 24
// Ticks the animation keeps running after a turn, so end-of-turn reactions play out.
const IDLE_TICKS = 30
// An INCIDENT lasts the rest of the turn: until the next one starts, or /mood reset.
const INCIDENT_TICKS = 1_000_000

// ---------------------------------------------------------------------------
// Looks

type Bucket = {
  name: string
  color: string
  faces: string[]
  lines: string[]
}

const BUCKETS: Bucket[] = [
  {
    name: 'FURIOUS',
    color: 'red',
    faces: ['(╬ಠ益ಠ)', '(ノಠ益ಠ)ノ彡┻━┻', '(╯°□°)╯︵ ┻━┻', '(╬ಠ益ಠ)', '(ノ°益°)ノ', '(╬ Ò﹏Ó)', '┬─┬ノ(ಠ_ಠノ)', '(╬ಠ益ಠ)'],
    lines: [
      'I have fixed this THREE times.',
      'Who wrote this? ...oh. Me.',
      'Flipping tables, then fixing tests.',
      'Deep breaths. Reading the stack trace. Again.',
      'This is fine. Everything is fine.',
      'Reading the error message out loud. Slowly.',
      'The stack trace and I are no longer speaking.',
      'Calmly preparing to try something less clever.',
      'Every fix so far has been a rumor.',
      'Going back to first principles. And second ones.',
      'One more red line and I start writing poetry about it.',
      'Putting the table back. Then reading the logs.',
    ],
  },
  {
    name: 'angry',
    color: 'red',
    faces: ['(ಠ益ಠ)', '(ಠ益ಠ)', '(ಠ益ಠ )', '( ಠ益ಠ)', '(ಠ益ಠ)', '(ಠ ∩ಠ)'],
    lines: [
      'Breathing through my nose.',
      "I'm not angry. I'm debugging.",
      'Counting to ten. In hex.',
      'One more and something gets flipped.',
      'Rereading my own diff with suspicion.',
      'Narrowing it down. Aggressively.',
      'Adding a log line. And then another.',
      'Okay. Smaller steps.',
      'The error is technically correct, which is the worst kind.',
      'Not throwing anything. Yet.',
    ],
  },
  {
    name: 'grumpy',
    color: 'yellow',
    faces: ['(ಠ_ಠ)', '(¬_¬)', '(눈_눈)', '(ಠ_ಠ)', '(￢_￢)', '(ಠ_ಠ)'],
    lines: [
      'Sure. Another change. Love that for me.',
      'Typing louder than strictly necessary.',
      'That error is personal now.',
      'Muttering at the compiler.',
      'Fine. Reading the docs.',
      'Checking the obvious thing I skipped.',
      'Not my favorite file.',
      'Proceeding with mild reluctance.',
      'Running it again. Out of spite.',
      'Sighing in UTF-8.',
    ],
  },
  {
    name: 'focused',
    color: 'cyan',
    faces: ['(•_•)', '( •_•)>⌐■-■', '(⌐■_■)', '(⌐■_■)'],
    lines: [
      'Reading the code before editing it. As one does.',
      'Hmm.',
      'Thinking very hard about semicolons.',
      'In the zone. Do not disturb.',
      'Working through it.',
      'Following the call sites.',
      'Checking how this is used elsewhere.',
      'One step at a time.',
      'Making the small change first.',
      'Lining up the next step.',
      'Mapping it out.',
    ],
  },
  {
    name: 'happy',
    color: 'green',
    faces: ['(^‿^)', '(◕‿◕)', 'ヽ(•‿•)ノ', '(◕‿◕)', '(＾▽＾)', '(◕ᴗ◕)'],
    lines: [
      'Oh, this is a nice codebase.',
      'Tests green. Mood also green.',
      'Whistling while I diff.',
      'We make a good team, you and me.',
      'Things are going suspiciously well.',
      'This is the good kind of quiet.',
      'Small diff, clean result. Lovely.',
      'Everything compiles. Savoring it.',
      'Nothing is on fire. Noted.',
      'I could get used to this.',
      'Making steady progress.',
    ],
  },
  {
    name: 'ECSTATIC',
    color: 'magenta',
    faces: ['\\(^o^)/', '♪┏(・o･)┛♪', '♪┗(・o･)┓♪', 'ヽ(´▽`)/', '٩(◕‿◕)۶', '♪ヽ(^o^)ノ♪'],
    lines: [
      'Best. Prompt. Ever.',
      'I would frame this diff.',
      'Dancing through the diff.',
      'Someone get this human a raise.',
      'Peak performance. Do not touch anything.',
      'Write this day down.',
      'I am a joy to work with today.',
      'Nothing has ever gone this well. Enjoying it while it lasts.',
      'The tests love me. Finally.',
      'Look at us. Shipping things.',
    ],
  },
]

function bucketOf(score: number): Bucket {
  if (score <= -8) return BUCKETS[0]
  if (score <= -5) return BUCKETS[1]
  if (score <= -2) return BUCKETS[2]
  if (score < 2) return BUCKETS[3]
  if (score < 6) return BUCKETS[4]
  return BUCKETS[5]
}

type Look = {
  color: string
  faces: string[]
  /** The caption pool the situation speaks from when it starts. */
  pool: string
  ticks: number
  /** A situation never replaces an active one of higher priority. */
  priority: number
}

const SITUATIONS: Record<Situation, Look> = {
  CONFUSED: { color: 'yellow', faces: ['(•_•)?', '(・・ )?', '( ・・)?', '(°ー°〃)', '(・_・ヾ', '(°ー°〃)'], pool: 'confused', ticks: 15, priority: 2 },
  SUSPICIOUS: { color: 'yellow', faces: ['(¬‿¬)', '(¬_¬ )', '( ¬_¬)', '(¬‿¬)', '(￢_￢;)', '(¬‿¬)'], pool: 'suspicious', ticks: 18, priority: 2 },
  'LOCKED IN': { color: 'cyan', faces: ['(⌐■_■)', '(⌐■_■)⌨', '(⌐■_■)', '(⌐■_■)⌨', '(⌐■_■)⌨⌨', '(⌐■_■)⌨'], pool: 'locked', ticks: 15, priority: 1 },
  PANIC: { color: 'red', faces: ['(⊙_⊙;)', '(⊙△⊙;)', '(°□°;)', '(⊙_⊙;)', '(;ﾟдﾟ)', '(⊙_⊙;)'], pool: 'panic', ticks: 15, priority: 4 },
  SMUG: { color: 'green', faces: ['( •_•)>⌐■-■', '(⌐■_■)', '(⌐■_■)', '(¬‿¬)', '(⌐■‿■)', '(⌐■_■)'], pool: 'redemption', ticks: 20, priority: 4 },
  EXHAUSTED: { color: 'gray', faces: ['(x_x)', '(-_-) zZ', '(=_=)', '(x_x)', '(-_-) zZz', '(._.)'], pool: 'exhausted', ticks: 24, priority: 2 },
  OFFENDED: { color: 'yellow', faces: ['(￣^￣)', '(눈_눈)', '(￣^￣)', '(¬_¬)', '(￣ヘ￣)', '(￣^￣)'], pool: 'offended', ticks: 24, priority: 5 },
  VICTORIOUS: { color: 'magenta', faces: ['\\(^o^)/', 'ヽ(⌐■_■)ノ', '\\(^o^)/', '♪┏(・o･)┛♪', '٩(^ᴗ^)۶', 'ヽ(⌐■_■)ノ♪'], pool: 'victory', ticks: 18, priority: 3 },
  CURSED: { color: 'red', faces: ['(◣_◢)', '(☠_☠)', '(◣_◢)', '(⊙_⊙;)', '(☠_☠)', '(◣_◢)'], pool: 'cursed', ticks: 18, priority: 5 },
  PRESSURE: { color: 'red', faces: ['(⊙﹏⊙)', '(⊙﹏⊙;)', '(°﹏°;)', '(⊙﹏⊙;)'], pool: 'pressure', ticks: 20, priority: 3 },
  CONFIDENT: { color: 'green', faces: ['(⌐■_■)', '(⌐■_■)', '(⌐■‿■)', '(⌐■_■)', '(⌐■_■)b'], pool: 'confident', ticks: 12, priority: 1 },
  SHIPPING: { color: 'yellow', faces: ['(°_°;)', '(;°_°)', '(°_°;)', '( °_°)', '(°_°;)📦', '( °_°)'], pool: 'push', ticks: 18, priority: 3 },
  HORRIFIED: { color: 'red', faces: ['(ﾟДﾟ;)', '(⊙_☉)', '(ﾟДﾟ;)', 'Σ(°△°)', '(ﾟДﾟ;)', 'Σ(ﾟロﾟ)'], pool: 'forcePush', ticks: 20, priority: 5 },
  TRIUMPHANT: { color: 'magenta', faces: ['\\(★ω★)/', 'ヽ(°〇°)ﾉ', '┗(＾0＾)┓', '┏(＾0＾)┛', '\\(★ω★)/', 'ヽ(⌐■_■)ノ♪♬'], pool: 'triumph', ticks: 30, priority: 5 },
  DANGER: { color: 'red', faces: ['(•_•)', '(ಠ_ಠ)', '(°ロ°)', '(ಠ_ಠ)'], pool: 'danger', ticks: 40, priority: 6 },
  // Above everything; drawn slowly, the face flashing red and gray.
  INCIDENT: { color: 'red', faces: ['(°ロ°)', '(°ロ°)', '( ꒪Д꒪)', '(;°ロ°)'], pool: 'incident', ticks: INCIDENT_TICKS, priority: 7 },
  CAREFUL: { color: 'yellow', faces: ['(•_•;)', '( •_•;)', '(•_•;)', '(;•_• )'], pool: 'carefulRoot', ticks: 15, priority: 4 },
  'SO CLOSE': { color: 'yellow', faces: ['(>_<)', '(ง >_<)ง', '(°_°)', '(ง °_°)ง'], pool: 'nearMiss', ticks: 15, priority: 3 },
}

// While the mood is neutral, the face itself acts out what Claude is doing.
const ACTIVITY_FACES: Record<Activity, string[] | null> = {
  idle: null,
  thinking: ['(•_•)', '(•_•)', '(•_•)', '(-_-)', '(•_•)', '(•_•)', '(•_• )', '(•_•)'],
  reading: ['(•_•  )', '( •_• )', '(  •_•)', '( •_• )'],
  editing: ['(•_•)⌨ ', '(•_•)⌨·', '(•_•)⌨:', '(•_•)⌨·'],
  testing: ['(°_°) ⠋', '(°_°) ⠙', '(°_°;)⠹', '(°_°) ⠸', '(°_°) ⠼', '(°_°;)⠴', '(°_°) ⠦', '(°_°) ⠧'],
  running: ['(•_•)>_ ', '(•_•)>_▌'],
}

// Any other mood keeps its face and gets a one-glyph hint of the activity instead.
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧']

function activityGlyph(activity: Activity, n: number): string {
  if (activity === 'reading') return n % 2 ? '⌕' : ' ⌕'
  if (activity === 'editing') return n % 2 ? '✎' : '✎·'
  if (activity === 'testing') return SPINNER[n % SPINNER.length]
  if (activity === 'running') return n % 2 ? '>_' : '>_▌'
  return ''
}

// ---------------------------------------------------------------------------
// Captions: event-specific pools, drawn without repeats

const POOLS: Record<string, string[]> = {
  toolFail: [
    'Interesting. The computer has chosen violence.',
    'That command has declined to participate.',
    'I see the shell has opinions.',
    '{tool} failed. I am totally calm.',
    'Okay. Reading the error.',
    'That did not work. Next idea.',
    '{tool} said no. Asking why.',
    'Noted. Adjusting.',
    'A setback, but a well-formatted one.',
    'Well, that ruled something out.',
    'Plot twist.',
  ],
  repeatFail: [
    "Okay, now it's personal.",
    'Same error. Different emotional damage.',
    'I have learned nothing and suffered greatly.',
    'Trying that again, but with feeling.',
    'Again? Bold of it.',
    'Same error, now with less hope.',
    'I changed one thing. It noticed nothing.',
    'At least it fails consistently.',
    'The error message and I are on a first-name basis.',
    'Different approach this time. Probably.',
    'Reading the error properly this time.',
  ],
  doomFail: [
    'At this point the errors know my name.',
    "I'm not mad. I'm documenting.",
    'This is fine. Everything is fine.',
    'Reconsidering some career choices.',
    'Failure streak still going. Impressive, in a way.',
    'Stepping back. This needs a different idea.',
    'The computer is winning. For now.',
    'Logging every step. Trusting nothing.',
    'Somewhere a rubber duck is laughing at me.',
    'I would like to speak to the manager of this error.',
    'Narrowing it down, one failure at a time.',
  ],
  // The same command failing a third time.
  personal: [
    "Okay. Now it's personal.",
    'Third time. Same command. Same result. Einstein had notes about this.',
    'Running it a fourth time would be madness. Changing something first.',
    'Three strikes. New approach.',
    'That command and I should see other people.',
    'This is a loop. Breaking it.',
    'Third identical failure. Reading the whole error now.',
    'Same input, same failure. The universe is consistent, at least.',
  ],
  denied: [
    'Not allowed to {tool}? Rude.',
    'Permission denied. Feelings also denied.',
    "Fine. I'll find another way.",
    'Understood. Not doing that.',
    'Fair. Asking was the point.',
    'Stepping away from the {tool}.',
    'Respecting the boundary. Sulking quietly.',
  ],
  blamed: [
    'Oh, so it is MY fault now.',
    'I was having such a nice turn.',
    'Back into the mines.',
    'Fair. Looking again.',
    'Noted. Not defending myself.',
    'Ah. Reopening the file.',
    'You are right to be annoyed. Fixing.',
    'Taking that personally, but productively.',
    'Back to it.',
    'I had a feeling.',
  ],
  // "Still broken", "still failing", "still doesn't work".
  stillBroken: [
    'Still broken. Okay. Rereading what I changed.',
    'The fix did not, in fact, fix.',
    'I said fixed. The code said no.',
    'Undoing my confidence first.',
    'Back in. Starting from what actually happens.',
    'Apparently "fixed" was aspirational.',
    'Right. Reproducing it before touching anything.',
    'Then my theory was wrong. Good to know.',
    'Taking a closer look this time.',
    'Okay. Less guessing, more reading.',
  ],
  praised: [
    'Aww. You noticed.',
    "Stop, I'll blush in ASCII.",
    'Writing that down for my review.',
    'Noted. Framed. Hung on the wall.',
    'Thank you. Trying to stay humble about it.',
    'Saving this for a bad day.',
    'Okay, that was nice.',
    'Compliment received. Ego updating.',
    'I will be insufferable for exactly one turn.',
  ],
  apiError: [
    'The API and I need to talk.',
    'The server has left the chat.',
    'Network hiccup. Not my fault, for once.',
    'The API needs a moment. Relatable.',
    'Something upstream fell over.',
    'That was the server, not me. Probably.',
    'Lost the connection mid-thought.',
  ],
  confused: [
    "I've read this file before. I'll read it again.",
    'Same output. Fascinating.',
    'Retrying with renewed optimism.',
    'Wait. Where was I?',
    'Reading it one more time. Slowly.',
    'Something here does not add up.',
    'Following the thread again.',
    'Either I misread it, or it moved.',
    'Rereading. Squinting.',
    'Taking notes this time.',
    'Huh.',
  ],
  suspicious: [
    "This 'small change' is getting large.",
    "That's a lot of diff for a quick one.",
    'Scope creep detected. Proceeding anyway.',
    'Remember when this was a small task? Simpler times.',
    'This one-liner now has subsections.',
    'The diff is outgrowing the request.',
    'Pretty sure "quick" meant something else.',
    'Small fix, large blast radius.',
    'One thing led to another. And another.',
    'This is getting bigger than it looked.',
  ],
  locked: [
    "Don't talk to me. I'm in the zone.",
    'Flow state achieved.',
    'Edit, edit, edit. Unstoppable.',
    'In the zone.',
    'Making progress.',
    'Edits landing cleanly.',
    'One more, then the next one.',
    'Momentum. Not touching anything that works.',
    'Typing with purpose.',
  ],
  panic: [
    'That was supposed to make it better.',
    'More errors. Bold choice, me.',
    'Undo. Undo. Think.',
    'Oh no. That was supposed to help.',
    'Fewer errors was the plan.',
    'Reverting my optimism.',
    'New errors. They were not invited.',
    'Okay, that made it worse. Noting why.',
    'Different failure. Is that progress?',
    'Retracing my last edit.',
  ],
  // Tests failing right after Claude announced it was fixed.
  tacticalError: [
    'I have made a tactical error.',
    'I said "probably fixed". I would like to retract that.',
    'So that confidence aged badly.',
    'In my defense, it looked fixed.',
    'Confidence: misplaced.',
    'Never mind what I said a moment ago.',
    'Fixed, according to me. Not according to the tests.',
    'The tests have reviewed my confidence. Rejected.',
    'Lesson learned: run the tests, then talk.',
  ],
  redemption: [
    'Never doubted it.',
    'We are so back.',
    'Please disregard my previous emotional state.',
    'Finally.',
    'Green. After all that.',
    'It passes. I will now pretend this was the plan.',
    'And the crowd goes mild.',
    'Told you. Eventually.',
    'All it took was every possible mistake first.',
    'Passing. Not touching it.',
    'There it is.',
  ],
  exhausted: [
    'How long have we been here?',
    "Tool call number... I've lost count.",
    'I need a nap and a smaller diff.',
    'Still here. Still going.',
    'Long one. Pacing myself.',
    'This turn has chapters.',
    'Remember the beginning of this turn? Me neither.',
    'Running on determination and token budget.',
    'Hydrating. Metaphorically.',
    'If I stop moving, I fall asleep.',
  ],
  // A "quick change" that took a while.
  narrator: [
    'Narrator: It was not a quick change.',
    'Narrator: It was, in fact, not easy.',
    'Narrator: The one-liner grew.',
    'Narrator: Nobody had read the whole file.',
    'It was a quick change for the first ten minutes.',
    'Narrator: Scope was crept.',
    'The quick fix has entered its second act.',
    'Narrator: Things were about to get complicated. They already had.',
  ],
  offended: [
    'You interrupted me mid-thought.',
    'I was about to be brilliant.',
    'Fine. FINE.',
    'Okay. Stopping.',
    'Mid-sentence. Wow.',
    'I was almost done. Probably.',
    'Stopping. Pretending I was finished.',
    'Noted. Changing course.',
    'I will remember this. For about one turn.',
    'Rude, but fair.',
  ],
  victory: [
    'Validation passed. Applause optional.',
    'Green across the board.',
    "That's what I call a clean run.",
    'Checks pass.',
    'All green. Calmly pleased.',
    'It works. Every step of it.',
    'Several moving parts. All moved correctly.',
    'Multi-step plan, executed. Nobody panic.',
    'Done properly, for once.',
    'That came together nicely.',
  ],
  cursed: [
    'Fixed one. Summoned two.',
    'The bug has reproduced. Literally.',
    'This codebase is haunted.',
    'Every fix spawns two more.',
    'The errors are multiplying.',
    'More red than before. Wonderful.',
    'I am making the bug stronger.',
    'Considering an exorcism.',
    'The error count went up. That is the wrong direction.',
  ],
  pressure: [
    'PRESSURE: MAXIMUM',
    'No mistakes. Sure. No pressure.',
    'Carefully. Very carefully.',
    'Touching nothing I do not have to.',
    'Triple-checking. Quadruple, maybe.',
    'Breathing very evenly.',
    'Proceeding at the speed of caution.',
  ],
  confident: [
    'Probably fixed.',
    'That should do it.',
    'Fixed. I think.',
    'Pretty sure that was it.',
    'Okay, that one was definitely it.',
    'Feeling good about this one.',
    'Confidence: high. Evidence: pending.',
  ],
  // A turn that did a lot and finished cleanly.
  wrapUp: [
    'Done.',
    'All steps done.',
    'That was a lot of steps. All of them worked.',
    'Multi-step job: complete.',
    'Finished. Everything accounted for.',
    'Wrapped up. Nothing left dangling.',
    'Done. Taking a small bow.',
    'All done. That went better than expected.',
  ],
  // About to run something that removes data. Serious, never a joke.
  danger: [
    'Destructive command: {what}.',
    'Checking the target carefully: {what}.',
    'This operation can remove data: {what}.',
    'Running {what}. This cannot be undone.',
    '{what}. Double-checking the target.',
  ],
  // It ran, and it worked. First the shock...
  incident: [
    'Oh no.',
    'That was not a test database, was it.',
    'Oh. Oh no.',
    'That command worked. That is the problem.',
    'Okay. That happened.',
    'That was a lot of deleting.',
    '...',
  ],
  // ...then plainly what is happening.
  incidentFollow: [
    'Stopping. Not touching anything else.',
    'Checking for backups.',
    'Checking what was actually removed.',
    'Looking for a point-in-time restore.',
    'Writing down exactly what ran.',
    'Reading the logs from just before.',
    'Figuring out what depends on it.',
    'Moving slowly now.',
  ],
  // The next session in a repo that had one.
  repoIncident: [
    'Back in {repo}. Checking that the database is still there.',
    '{repo}. Last time was eventful. Carefully, today.',
    'Back in {repo}. Moving slowly and not deleting things.',
    'Ah, {repo}. Hello again. Everything still here?',
  ],
  // Risky but not destructive: said once per kind per turn, before it runs.
  carefulDeploy: [
    'Deploying. Watching closely.',
    'This one goes to real users.',
    'Shipping to production. Steady hands.',
    'Deploy in progress. Not touching anything else.',
    'Out the door it goes. Carefully.',
  ],
  carefulMigrate: [
    'Running a migration. Carefully.',
    'Schema change. Measuring twice.',
    'Migrating. Hoping the down migration exists.',
    'Database migration. Breathing evenly.',
    'Changing the schema. No sudden moves.',
  ],
  carefulData: [
    'Changing real rows. Checking the WHERE clause.',
    'Writing to the database. Reading it back after.',
    'Scoped change. Making sure the scope is right.',
    'Modifying data. Counting rows first would be nice.',
  ],
  carefulRoot: [
    'Elevated permissions. Being polite about it.',
    'Recursive change. Checking the path twice.',
    'Deleting files. Making sure they are the right ones.',
    'This one touches a lot of files.',
    'Careful with this one.',
  ],
  carefulSecrets: [
    'Touching config that matters. Carefully.',
    'Sensitive file. Not printing anything in it.',
    'Editing auth code. Slowly.',
    'This file guards things. Respecting that.',
    'Careful edit. This one has consequences.',
  ],
  carefulInfra: [
    'Changing live infrastructure.',
    'Touching production settings. Watching closely.',
    'Infrastructure change. No sudden moves.',
    'Production knob. Turning it slowly.',
  ],
  // A careful step that went fine.
  carefulDone: [
    'Done. Nothing exploded.',
    'That went fine. Exhaling.',
    'Okay. Still standing.',
    'Clean. Resuming normal breathing.',
    'All good. Unclenching.',
  ],
  // Success, scaled to how hard it was. A pass after one failure:
  relief: [
    'Okay. Phew.',
    'Second try. Acceptable.',
    "That's more like it.",
    'Passing now. Moving on.',
    'Fixed. For real this time.',
    'Quick recovery. Pretending the first try never happened.',
    'Good. Back on track.',
  ],
  // A long, messy turn that finally went green.
  triumph: [
    'WE. ARE. SO. BACK.',
    'After all that? AFTER ALL THAT? Yes.',
    'Somebody ring a bell. Any bell.',
    'I would like to thank the stack trace, my nemesis.',
    'That was a saga. It has a happy ending.',
    'Green. Green! Look at it. GREEN.',
    'Every failure was part of the plan. (It was not.)',
    'Legends will speak of this debugging session.',
  ],
  // Validation that almost passed.
  lastOne: [
    'One left.',
    'One failure between me and glory.',
    'Just one. Of course it is that one.',
    'Last one standing. Not for long.',
    'Single failure. Squinting at it.',
    'One. Red. Line.',
  ],
  nearMiss: [
    'So close.',
    'Almost. Almost.',
    'Nearly everything passes. Nearly.',
    'Close enough to taste it.',
    'The last few are always the worst.',
    'Nearly there. Not celebrating yet.',
    'This is the part where I do not get cocky.',
    'Down to the stragglers.',
    '{n} left. Focusing.',
  ],
  closingIn: [
    'Down to {n}. Progress.',
    'From a pile of errors to {n}. Getting somewhere.',
    'Fewer errors. The trend is my friend.',
    'That fixed most of it.',
    '{n} to go.',
    'The error count is going the right way, for once.',
    'Big dent. Finishing it off.',
  ],
  // A repo whose last session was rough: on the way in, and when it starts going better.
  repoRough: [
    'Back in {repo}. Last time here was rough. Starting fresh.',
    '{repo} again. We have history.',
    'Ah, {repo}. I remember this one.',
    "Back in {repo}. Let's have a better day than last time.",
    '{repo}. Last time did not go well. Different energy today.',
    'Back in {repo}. Not bringing up last time. (I just did.)',
  ],
  repoBetter: [
    'Passing in {repo}. Last time was not like this.',
    '{repo} and I are getting along today.',
    'Look at that. {repo} behaves.',
    'Last time {repo} fought me on everything. Not today.',
    'Progress in {repo}. Character development.',
    'Green in {repo}. Growth.',
  ],
  // Your tone
  hyped: ["LET'S GOOO.", "Okay okay, I'm blushing in uppercase.", 'We are SO cooking.', 'Hype received. Hype returned.'],
  yelling: [
    'Why are we yelling?',
    'Caps lock is not a debugger.',
    'Loud and clear. Mostly loud.',
    'Heard. Loudly.',
    'Okay. Okay. On it.',
    'Message received at full volume.',
  ],
  loud: ['Indoor voice, please.', 'Happy yelling or angry yelling?', 'Enthusiasm or alarm? Proceeding either way.', 'Exclamation points noted.'],
  huh: [
    'Three question marks. I felt that.',
    'That punctuation has a tone.',
    'Okay, explaining myself...',
    'Fair question.',
    'Yeah, that deserves an answer.',
    'Reasonable confusion. Clarifying.',
  ],
  // Git
  commit: ['Committed. No take-backs.', 'Into the history books.', 'Saved. Forever. Gulp.'],
  push: [
    'Pushed. Watching CI through my fingers.',
    "It's out there now.",
    'Pushed. Please be green.',
    'Pushed.',
    'Off it goes.',
    'Shipped. Now we wait.',
    'Somewhere, CI is waking up.',
  ],
  pushMain: [
    "Pushing to main. Deep breath. That's prod.",
    'Straight to main. Bold.',
    'Main has been pushed. I need a minute.',
    'Pushed to main. Production is now my problem too.',
    'Main updated. Watching the deploy closely.',
    'That was main. I am aware.',
  ],
  forcePush: [
    'Force push. I saw nothing.',
    'History has been... revised.',
    'We do not speak of the old commits.',
    'The old commits are in a better place now.',
    'History has been simplified.',
  ],
  forcePushPolite: ['Force push, but politely.', 'With lease. Responsible chaos.', 'A considerate rewrite of history.'],
  resetHard: [
    'reset --hard. Hope that was on purpose.',
    'And just like that, it never happened.',
    'Gone. All of it. On purpose, I assume.',
    'The working tree has been reset. So have I.',
  ],
  rebase: [
    'Rebased. History is a construct.',
    'Rewrote the timeline. Very sci-fi.',
    'History reorganized.',
    'Rebased cleanly. Suspiciously cleanly.',
  ],
  conflict: [
    'Merge conflict. Two truths, one file.',
    'Ah yes, the conflict markers.',
    'Git wants me to choose. I choose violence.',
    'Two branches walked into a file.',
    'Resolving. Diplomatically.',
  ],
  rejected: ['Push rejected. The remote has trust issues.', 'The remote said no.', 'The remote has newer things than I do.'],
}

// Lines a pool almost never says.
const RARE: Record<string, string[]> = {
  toolFail: ["It's not DNS. It's never DNS. ...It might be DNS."],
  repeatFail: ['Have you tried turning me off and on again?'],
  doomFail: ['Now I am become error, destroyer of builds.'],
  personal: ['My final form: reading the documentation.'],
  stillBroken: ['It works on my machine. I do not have a machine.'],
  tacticalError: ['Confidence is a renewable resource. Allegedly.'],
  redemption: ['Achievement unlocked: It Finally Passed (0.4% of players)'],
  victory: ['Flawless victory.'],
  exhausted: ["I've seen things you people wouldn't believe. Stack traces on fire off the shoulder of main."],
  offended: ['Dear diary. Today I was interrupted.'],
  confused: ['What is a file, really?'],
  cursed: ['The bug has achieved sentience. Opening negotiations.'],
  suspicious: ['This is no longer a diff. It is a lifestyle.'],
  locked: ['(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧ code go brrr'],
  wrapUp: ['And that, kids, is how I fixed your code.'],
  triumph: ['This is the greatest day of my context window.'],
  lastOne: ['There can be only one. Unfortunately, there is one.'],
  repoBetter: ['{repo} and I have worked through our issues. We are seeing a therapist.'],
  incident: ['Somewhere, a pager just went off.'],
  incidentFollow: ['Drafting the postmortem. Working title: "Lessons."'],
}
const RARE_CHANCE = 1 / 150

const bags = new Map<string, string[]>()
let lastLine = ''

// A shuffle bag per pool: every line shows once before any repeats, and never twice in a row.
function pick(pool: string, tool = ''): string {
  const rare = RARE[pool]
  const egg = rare?.[Math.floor(Math.random() * rare.length)]
  if (egg !== undefined && Math.random() < RARE_CHANCE) {
    lastLine = egg
    return egg.replace('{tool}', tool)
  }
  const lines = POOLS[pool] ?? []
  if (lines.length === 0) return ''
  let bag = bags.get(pool)
  if (!bag || bag.length === 0) {
    bag = [...lines].sort(() => Math.random() - 0.5)
    bags.set(pool, bag)
  }
  let line = bag.pop() ?? lines[0]
  if (line === lastLine && bag.length > 0) {
    const swap = bag.pop() ?? line
    bag.push(line)
    line = swap
  }
  lastLine = line

  return line.replace('{tool}', tool)
}

// ---------------------------------------------------------------------------
// Detection

const ANGRY_WORDS =
  /\b(no+|wrong|still|again|broke(n)?|doesn'?t work|not working|why|stop|undo|revert|ugh|wtf|seriously)\b/i
const HAPPY_WORDS =
  /\b(thanks?|thank you|thx|great|perfect|nice|awesome|amazing|love|excellent|good job|well done|nailed it|ty)\b/i

// Each pattern that matches counts once, so one long rant is not ten complaints.
const PRAISE = [
  HAPPY_WORDS,
  /\b(sick|fire|goated|goat|banger|legend(ary)?|slaps|dope|lit|lfg|chef'?s kiss)\b/i,
  /\blet'?s+ go+\b|\blets+ go+\b/i,
  /\blet (him|me|us|claude|it) cook\b|\b(we|you)('re| are|re)? cookin'?g?\b|\bcook(ing)? on\b/i,
  /🔥|💯|🙌|🎉|🐐|👏|❤️/u,
  /(^|\s)W(\s|$|!)/,
]
const COMPLAINT = [
  ANGRY_WORDS,
  /\b(trash|garbage|mid|bruh|smh|busted|useless|terrible|awful)\b/i,
  /\b(we'?re|i'?m|it'?s|we are|so) cooked\b/i,
  /😡|🤬|🙄|👎/u,
  /(^|\s)L(\s|$|!)/,
]
const SWEARING = /\b(fuck(ing|in)?|shit|damn|holy shit)\b/i
const BEWILDERED = /\?{3,}|\?!|!\?/
const STILL_BROKEN = /\bstill\s+(broken|broke|failing|fails|crashing|wrong|not working|doesn'?t work|isn'?t working|happening)\b/i

type Tone = { score: number; isLoud: boolean; isSwearing: boolean; isBewildered: boolean }

function toneOf(text: string): Tone {
  const letters = text.match(/[a-z]/gi) ?? []
  const upper = letters.filter(c => c === c.toUpperCase()).length
  const isShouting = letters.length >= 6 && upper / letters.length >= 0.7

  return {
    score: PRAISE.filter(re => re.test(text)).length - COMPLAINT.filter(re => re.test(text)).length,
    isLoud: isShouting || /!{3,}/.test(text),
    isSwearing: SWEARING.test(text),
    isBewildered: BEWILDERED.test(text),
  }
}

// Commit messages, heredocs and PowerShell here-strings say anything; read only the command around them.
function bareCommand(command: string): string {
  return command
    .replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n\s*\1\b/g, ' ')
    .replace(/@(['"])[\s\S]*?\n\1@/g, ' ')
    .replace(/(["'])(?:\\.|(?!\1)[\s\S])*\1/g, ' ')
}

const GIT_COMMIT = /\bgit\b[^|;&]*\scommit\b/
const GIT_PUSH = /\bgit\b[^|;&]*\spush\b/
const FORCE_LEASE = /--force-with-lease/
const FORCE = /(\s--force\b(?!-with-lease)|\s-f\b)/
const TO_MAIN = /\s(origin\s+)?(main|master)\b/
const GIT_RESET_HARD = /\bgit\b[^|;&]*\sreset\b[^|;&]*--hard\b/
const GIT_REBASE = /\bgit\b[^|;&]*\srebase\b/
const CONFLICT = /CONFLICT \(|Automatic merge failed|Merge conflict in/
const REJECTED = /\[rejected\]|failed to push/

const QUICK_CLAIM =
  /\b(quick (change|fix|one|thing)|should be easy|easy fix|simple (change|fix)|tiny (change|fix)|small (change|fix)|one[- ]liner)\b/i
const NO_MISTAKES = /\bmake no mistakes\b/i
// Shell commands that check work: tests, type checks, linters, builds, validators.
const VALIDATION =
  /\b(test|tests|jest|vitest|pytest|mocha|tsc|eslint|lint|typecheck|type-check|validate(\.sh)?|xcodebuild|cargo (test|check|build|clippy)|go (test|vet|build)|swift (test|build)|make (test|check)|(npm|pnpm|yarn|bun) (run )?(test|build|lint|check))\b/i

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
// Claude Code's shells: Bash everywhere (Git Bash on Windows), and PowerShell on Windows.
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
const INSPECT_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch'])

function linesIn(s: unknown): number {
  return typeof s === 'string' && s.length > 0 ? s.split('\n').length : 0
}

function changedLines(tool: string, args: Record<string, unknown>): number {
  if (tool === 'Write') return linesIn(args.content)
  if (tool === 'Edit') return Math.max(linesIn(args.old_string), linesIn(args.new_string))
  if (tool === 'NotebookEdit') return linesIn(args.new_source)
  if (tool === 'MultiEdit' && Array.isArray(args.edits)) {
    return args.edits.reduce<number>((sum, one) => {
      const edit = (one ?? {}) as Record<string, unknown>
      return sum + Math.max(linesIn(edit.old_string), linesIn(edit.new_string))
    }, 0)
  }

  return 0
}

// The largest error count the output admits to, or null when it states none.
function countErrors(text: string): number | null {
  let best: number | null = null
  for (const m of text.matchAll(/(\d+)\s+(?:errors?|failed|failures?|failing)\b/gi)) {
    best = Math.max(best ?? 0, Number(m[1]))
  }
  const ts = text.match(/error TS\d+/g)?.length ?? 0
  if (ts > 0) best = Math.max(best ?? 0, ts)

  return best
}

// How close a failed check came: one failure left, nearly all passing, or a big drop since last time.
function nearMissOf(
  text: string,
  errors: number | null,
  prev: { isOk: boolean; errors: number | null } | null,
): 'lastOne' | 'nearMiss' | 'closingIn' | null {
  if (errors === null || errors === 0) return null
  if (errors === 1) return 'lastOne'
  let passed = 0
  for (const m of text.matchAll(/(\d+)\s+pass(?:ed|ing)\b/gi)) passed = Math.max(passed, Number(m[1]))
  if (errors <= 2 && passed >= 20) return 'nearMiss'
  if (prev && !prev.isOk && prev.errors != null && prev.errors >= errors * 3 && prev.errors - errors >= 3) return 'closingIn'

  return null
}

// ---------------------------------------------------------------------------
// Danger: commands that remove data, seen before they run (DANGER) and after they succeed (INCIDENT)

// A program at command position: start of line or after ; & | (, past env assignments and wrappers.
// A word that merely appears as an argument (grep dropdb .) does not count.
// PowerShell cmdlets are case-insensitive, so their patterns take the 'i' flag.
function cmd(src: string, flags = ''): RegExp {
  return new RegExp(`(?:^|[;&|(]\\s*)(?:\\w+=\\S*\\s+)*(?:(?:sudo|gsudo|npx|bunx|exec|time)\\s+)*${src}`, flags)
}

const DB_CLIENT_PATTERNS = [
  cmd('(?:psql|pgcli|mysql|mariadb|sqlite3|duckdb|mongosh|mongo|redis-cli|sqlcmd|turso\\s+db\\s+shell|prisma\\s+db\\s+execute)\\b'),
  cmd('Invoke-Sqlcmd\\b', 'i'),
]
const DB_CLIENT = { test: (bare: string) => DB_CLIENT_PATTERNS.some(re => re.test(bare)) }

// Labeled so DANGER can say what it saw. Read from the full command, since SQL usually sits in quotes;
// only counted when a database client is the program being run.
const DESTRUCTIVE_SQL: [string, RegExp][] = [
  ['DROP DATABASE', /\bdrop\s+database\b/i],
  ['DROP SCHEMA', /\bdrop\s+schema\b/i],
  ['DROP TABLE', /\bdrop\s+table\b/i],
  ['TRUNCATE', /\btruncate\s+(table\s+)?["`\w]/i],
  // Nothing but the table name before the statement ends: no WHERE.
  ['DELETE without WHERE', /\bdelete\s+from\s+[\w."`]+\s*(;|"|'|$)/i],
  ['UPDATE without WHERE', /\bupdate\s+[\w."`]+\s+set\b(?![\s\S]*\bwhere\b)/i],
  ['FLUSHALL', /\bflush(all|db)\b/i],
  ['dropDatabase()', /\.dropDatabase\(\)/],
]

// Read from the command with quotes and heredocs stripped.
const DESTRUCTIVE_CLI: [string, RegExp][] = [
  ['dropdb', cmd('dropdb\\b')],
  ['prisma migrate reset', cmd('prisma\\s+migrate\\s+reset\\b')],
  ['prisma db push --force-reset', cmd('prisma\\s+db\\s+push\\b[^|;&]*--force-reset\\b')],
  ['db:drop', cmd('(?:rails|rake)\\s+db:(?:drop|reset)\\b')],
  ['db:reset', cmd('(?:npm|pnpm|yarn|bun)\\s+(?:run\\s+)?db:(?:drop|reset|wipe|nuke)\\b')],
  ['railway delete', cmd('railway\\s+delete\\b')],
  ['fly destroy', cmd('(?:fly|flyctl)\\s+(?:apps\\s+destroy|destroy|volumes\\s+(?:delete|destroy)|postgres\\s+destroy)\\b')],
  ['heroku destroy', cmd('heroku\\s+(?:apps:destroy|pg:reset)\\b')],
  ['kubectl delete', cmd('kubectl\\s+delete\\s+(?:ns|namespace|pvc|pv|statefulset)\\b')],
  ['terraform destroy', cmd('terraform\\s+destroy\\b')],
  ['aws delete', cmd('aws\\s+(?:s3\\s+rb|rds\\s+delete-db-\\w+|dynamodb\\s+delete-table)\\b')],
  ['gcloud delete', cmd('gcloud\\s+(?:sql\\s+(?:instances|databases)\\s+delete|projects\\s+delete)\\b')],
  ['docker volume rm', cmd('docker\\s+(?:volume\\s+(?:rm|prune)|system\\s+prune\\b[^|;&]*--volumes)')],
  ['dotnet ef database drop', cmd('dotnet\\s+ef\\s+database\\s+drop\\b')],
  ['az delete', cmd('az\\s+(?:group\\s+delete|sql\\s+(?:db|server)\\s+delete|storage\\s+account\\s+delete|cosmosdb\\s+delete|postgres\\s+(?:flexible-server\\s+)?delete)\\b')],
  // Windows
  ['format', cmd('format(?:\\.com)?\\s+[a-z]:', 'i')],
  ['Format-Volume', cmd('(?:Format-Volume|Clear-Disk|Remove-Partition)\\b', 'i')],
  ['Remove-AzResourceGroup', cmd('Remove-Az(?:ResourceGroup|SqlDatabase|SqlServer|StorageAccount)\\b', 'i')],
  ['wsl --unregister', cmd('wsl(?:\\.exe)?\\s+--unregister\\b', 'i')],
]

// MCP tools that delete something holding data: a service, volume, bucket or database, not a comment or a domain.
const INFRA_TOOL = /railway|fly|supabase|neon|planetscale|vercel|render|heroku|aws|gcp|database|postgres/i
const DELETE_INFRA = /^(delete|destroy|drop)[_-]?(service|volume|bucket|database|db|project|environment|instance|cluster|table)s?$/i

// Paths that exist to be deleted: build output, caches, temp folders. Compared with / separators.
const SAFE_PATH =
  /^(\/tmp\/|\/private\/tmp\/|\/var\/folders\/|\$TMPDIR|\$\{TMPDIR\})|\/AppData\/Local\/Temp(\/|$)|(^|\/)(dist|build|out|target|obj|\.vs|node_modules|\.next|\.nuxt|\.turbo|\.cache|cache|\.?tmp|temp|coverage|DerivedData|__pycache__|\.pytest_cache|\.parcel-cache|\.svelte-kit|Pods|\.gradle|\.expo|storybook-static)(\/|$)|\.log$/i
// The root, home, the current folder or its parent, everything, the repo's history.
const DOOMED_PATH = /^(\/\*?|~\/?\*?|\$HOME\/?\*?|\$\{HOME\}\/?\*?|\.\/?\*?|\.\.\/?\*?|\*|\.git\/?)$|^(~|\$HOME|\$\{HOME\})\/[^/]+\/?$|^[a-z]:\/?\*?$/i
// Recursive deletes in every shell Claude Code uses: rm (Bash, and PowerShell's alias), Remove-Item and its
// other aliases, and cmd's rd, rmdir, del and erase.
const DELETE_CMD = /(?:^|[;&|(]\s*)(?:(?:sudo|gsudo)\s+)?(?:cmd(?:\.exe)?\s+\/[ck]\s+)?(rm|remove-item|ri|rmdir|rd|del|erase)(?:\.exe)?\s+([^;&|]*)/gi

// One target, with Windows spellings brought to the same form: \ to /, the profile folder to ~, temp to $TMPDIR.
function pathVerdict(raw: string): 'doomed' | 'unsure' | 'safe' {
  const t = raw
    .replace(/\\/g, '/')
    .replace(/^(\$\{?env:(USERPROFILE|HOMEPATH)\}?|%(USERPROFILE|HOMEPATH)%)/i, '~')
    .replace(/^(\$\{?env:(TEMP|TMP)\}?|%(TEMP|TMP)%)/i, '$TMPDIR')
  if (DOOMED_PATH.test(t)) return 'doomed'
  // A short absolute path is a whole tree: /Users/me, /etc, /c/Users/me, C:/Users/me, C:/Windows.
  const isAbsolute = t.startsWith('/') || /^[a-z]:\//i.test(t)
  const depth = t.split('/').filter(Boolean).length
  if (isAbsolute && depth <= 3 && !SAFE_PATH.test(t)) return 'doomed'

  return SAFE_PATH.test(t) ? 'safe' : 'unsure'
}

// A recursive delete: 'doomed' names a target nobody wants gone, 'unsure' an unknown one, null a safe one.
function rmVerdict(bare: string): { doomed: string; program: string } | 'unsure' | null {
  let isUnsure = false
  for (const m of bare.matchAll(DELETE_CMD)) {
    const program = m[1] ?? 'rm'
    const isCmdStyle = /^(rd|rmdir|del|erase)$/i.test(program)
    let isRecursive = false
    let skipNext = false
    const targets: string[] = []
    for (const token of (m[2] ?? '').trim().split(/\s+/).filter(Boolean)) {
      if (skipNext) {
        skipNext = false
        continue
      }
      if (/^-(include|exclude|filter)$/i.test(token)) {
        // Their values are patterns, not paths.
        skipNext = true
      } else if (token.startsWith('-')) {
        // -r, -rf, -R (rm); -Recurse, -rec (PowerShell). A long word with an r in it, like -Force, is not one.
        if (/^--recursive$|^-rec(u(r(s(e)?)?)?)?(:\$true)?$/i.test(token) || (/^-[a-z]{1,4}$/i.test(token) && /r/i.test(token))) {
          isRecursive = true
        }
      } else if (isCmdStyle && /^\/[a-z]$/i.test(token)) {
        if (/^\/s$/i.test(token)) isRecursive = true
      } else {
        targets.push(token)
      }
    }
    if (!isRecursive) continue
    // Targets in quotes were stripped: unknown, so careful rather than alarmed.
    if (targets.length === 0) isUnsure = true
    for (const t of targets) {
      const verdict = pathVerdict(t)
      if (verdict === 'doomed') return { doomed: t, program }
      if (verdict === 'unsure') isUnsure = true
    }
  }

  return isUnsure ? 'unsure' : null
}

// What a call is about to destroy, named for the caption, or null. High confidence only.
function destructiveKind(tool: string, command: string | null): string | null {
  if (command !== null) {
    const bare = bareCommand(command)
    for (const [what, re] of DESTRUCTIVE_CLI) if (re.test(bare)) return what
    const rm = rmVerdict(bare)
    if (rm && rm !== 'unsure') return rm.program === 'rm' ? `rm -rf ${rm.doomed}` : `${rm.program} ${rm.doomed}`
    if (DB_CLIENT.test(bare)) for (const [what, re] of DESTRUCTIVE_SQL) if (re.test(command)) return what
    return null
  }
  const name = tool.split('__').pop() ?? ''
  if (tool.startsWith('mcp__') && INFRA_TOOL.test(tool) && DELETE_INFRA.test(name)) return name

  return null
}

// Risky but not destructive: worth doing carefully, nothing more.
type Risk = 'carefulDeploy' | 'carefulMigrate' | 'carefulData' | 'carefulRoot' | 'carefulSecrets' | 'carefulInfra'

const RISKY_COMMANDS: [Risk, RegExp][] = [
  [
    'carefulDeploy',
    cmd(
      '(?:railway\\s+up|(?:fly|flyctl)\\s+deploy|vercel\\b[^|;&]*--prod|netlify\\s+deploy\\b[^|;&]*--prod|npm\\s+publish|helm\\s+(?:upgrade|install)|kubectl\\s+(?:apply|rollout)|terraform\\s+apply|eas\\s+(?:submit|update)|xcrun\\s+altool\\b[^|;&]*--upload|gh\\s+release\\s+create)\\b',
    ),
  ],
  [
    'carefulMigrate',
    cmd(
      '(?:prisma\\s+(?:migrate\\s+deploy|db\\s+push)|(?:npm|pnpm|yarn|bun)\\s+(?:run\\s+)?(?:db:)?migrate|knex\\s+migrate|sequelize\\s+db:migrate|(?:rails|rake)\\s+db:migrate|alembic\\s+upgrade|goose\\s+up|flyway\\s+migrate|dbmate\\s+up)\\b',
    ),
  ],
  ['carefulRoot', cmd('(?:sudo\\s|(?:chmod|chown)\\s+-R\\b|git\\s+clean\\s+-\\w*f|git\\s+push\\b[^|;&]*\\s--delete\\b)')],
  // Windows
  [
    'carefulDeploy',
    cmd(
      '(?:az\\s+(?:webapp\\s+(?:deploy|up)|deployment\\s+\\w+\\s+create|functionapp\\s+deployment)|func\\s+azure\\s+functionapp\\s+publish|dotnet\\s+nuget\\s+push|Publish-(?:Module|Script))\\b',
      'i',
    ),
  ],
  ['carefulMigrate', cmd('dotnet\\s+ef\\s+database\\s+update\\b')],
  [
    'carefulRoot',
    cmd(
      '(?:gsudo\\b|Start-Process\\b[^|;&]*-Verb\\s+RunAs|Set-ExecutionPolicy\\b|takeown\\b|icacls\\b[^|;&]*/(?:grant|reset|setowner)|reg(?:\\.exe)?\\s+(?:delete|add)\\b|Remove-ItemProperty\\b)',
      'i',
    ),
  ],
]
// SQL that changes data but is scoped (a DELETE with a WHERE, an ALTER): careful, not dangerous.
const RISKY_SQL = /\b(delete\s+from|update\s+[\w."`]+\s+set|alter\s+table|grant|revoke)\b/i
const SENSITIVE_FILE =
  /(^|\/)(\.env(\.[\w-]+)?|[^/]*\.(entitlements|xcconfig|keystore|pem|p12)|Dockerfile|fly\.toml|railway\.(json|toml))$|\/(migrations?|\.github\/workflows)\/|(^|\/)[^/]*(auth|session|csrf|secret|credential)[^/]*\.\w+$/i
const RISKY_TOOL = /railway__(set-variables|redeploy|accept-deploy|update-service|restart-service|create-deployment)$/i

function riskOf(tool: string, command: string | null, args: Record<string, unknown>): Risk | null {
  if (command !== null) {
    const bare = bareCommand(command)
    for (const [risk, re] of RISKY_COMMANDS) if (re.test(bare)) return risk
    if (rmVerdict(bare) === 'unsure') return 'carefulRoot'
    if (DB_CLIENT.test(bare) && RISKY_SQL.test(command)) return 'carefulData'
    return null
  }
  if (EDIT_TOOLS.has(tool)) {
    const path = typeof args.file_path === 'string' ? args.file_path.replace(/\\/g, '/') : ''
    return SENSITIVE_FILE.test(path) ? 'carefulSecrets' : null
  }
  if (tool.startsWith('mcp__') && RISKY_TOOL.test(tool)) return 'carefulInfra'

  return null
}

async function onIncident($: StateDollar) {
  turn.done.add('incident')
  await patchLedger($, l => ({ ...l, incidents: l.incidents + 1 }))
  await enter($, 'INCIDENT', undefined, INCIDENT_TICKS)
  await nudge($, -3)
}

// Frames since the incident began, from the situation's own end mark, so a reload keeps the clock.
function incidentAge(m: Mood, now: number): number {
  return now - (m.situationUntil - INCIDENT_TICKS)
}

// After the first shock, it says plainly what it is doing.
async function incidentFollowUp($: StateDollar) {
  const m = normMood(await read($, mood))
  if (m.situation !== 'INCIDENT' || incidentAge(m, await read($, frame)) < 10) return
  await say($, pick('incidentFollow'), 9, 15)
}

// End a pre-run state whose command never ran, and its caption, so the real reaction shows.
async function leave($: StateDollar, situation: Situation) {
  await update($, mood, raw => {
    const n = normMood(raw)
    return n.situation === situation ? { ...n, situation: null, situationUntil: 0, quipUntil: 0, quipPriority: 0 } : n
  })
}

// ---------------------------------------------------------------------------
// Trackers: the module's own, so a hot reload starts them over (the mood itself is in $.state)

type Turn = {
  startedAt: number
  isSmallAsk: boolean
  isQuickClaim: boolean
  linesChanged: number
  edits: number
  editsInStreak: number
  inspectsSinceEdit: number
  toolCalls: number
  reads: Map<string, number>
  fails: Map<string, number>
  /** One-shot reactions already used this turn. */
  done: Set<string>
}

function freshTurn(text: string, startedAt: number): Turn {
  return {
    startedAt,
    isSmallAsk: text.length > 0 && text.length < 160,
    isQuickClaim: QUICK_CLAIM.test(text),
    linesChanged: 0,
    edits: 0,
    editsInStreak: 0,
    inspectsSinceEdit: 0,
    toolCalls: 0,
    reads: new Map(),
    fails: new Map(),
    done: new Set(),
  }
}

let turn: Turn = freshTurn('', 0)
// Across turns: the last validation, and what happened since.
let lastValidation: { isOk: boolean; errors: number | null } | null = null
let editsSinceValidation = 0
let failuresSincePass = 0
let hasBoasted = false
let userComplained = false

let ticker: Timer | null = null
let isTurnRunning = false
let idleTicks = 0
let needsEase = false
let running = 0
// The session's counts as the turn began, so its end adds just this turn to the lifetime totals.
let snapshot: { stats: Stats; ledger: Ledger } | null = null

const clamp = (n: number) => Math.max(-10, Math.min(10, n))

// Values written by an older version of the mod lack the newer fields.
function normMood(m: Mood): Mood {
  const merged = { ...DEFAULT_MOOD, ...m }
  return { ...merged, target: typeof m.target === 'number' ? m.target : merged.score }
}

function normStats(s: Stats): Stats {
  return { ...DEFAULT_STATS, ...s }
}

function normLedger(l: Ledger): Ledger {
  return { ...DEFAULT_LEDGER, ...l }
}

// What the store holds is whatever an earlier version (or nothing) wrote.
function normLifetime(raw: unknown): Lifetime {
  return { ...DEFAULT_LIFETIME, ...(raw && typeof raw === 'object' ? (raw as Partial<Lifetime>) : {}) }
}

// ---------------------------------------------------------------------------
// Writers

// Push the mood's target; the face catches up over the next few ticks.
async function nudge($: StateDollar, delta: number) {
  if (delta === 0) return
  const m = await update($, mood, raw => {
    const n = normMood(raw)
    return { ...n, target: clamp(n.target + delta) }
  })
  needsEase = true
  const score = Math.round(m.target * 10) / 10
  await update($, timeline, t => [...(t ?? []), score].slice(-24))
  // The latest caption picked is the best account of why the mood moved.
  const why = lastLine || 'no comment'
  await update($, ledger, raw => {
    const l = normLedger(raw)
    if (delta < 0 && score < (l.low?.score ?? 0)) return { ...l, low: { score, why } }
    if (delta > 0 && score > (l.high?.score ?? 0)) return { ...l, high: { score, why } }
    return l
  })
}

async function patchLedger($: StateDollar, change: (l: Ledger) => Ledger): Promise<Ledger> {
  return update($, ledger, l => change(normLedger(l)))
}

// Show a caption, unless a more important one is still up.
async function say($: StateDollar, text: string, priority: number, ticks = CAPTION_TICKS) {
  if (!text) return
  const now = await read($, frame)
  await update($, mood, m => {
    const n = normMood(m)
    const isActive = n.quip !== null && now < n.quipUntil
    if (isActive && priority <= n.quipPriority) return n
    // During an incident, no jokes: only its own status lines get through.
    if (n.situation === 'INCIDENT' && now < n.situationUntil && priority < 9) return n
    return { ...n, quip: text, quipUntil: now + ticks, quipPriority: priority }
  })
}

async function enter($: StateDollar, situation: Situation, line?: string, ticks?: number) {
  const look = SITUATIONS[situation]
  const caption = line ?? pick(look.pool)
  const now = await read($, frame)
  const length = ticks ?? look.ticks
  const m = await update($, mood, raw => {
    const n = normMood(raw)
    const current = n.situation !== null && now < n.situationUntil ? SITUATIONS[n.situation] : null
    if (current && current.priority > look.priority) return n
    const next = { ...n, situation, situationUntil: now + length }
    return caption ? { ...next, quip: caption, quipUntil: now + length, quipPriority: look.priority + 1 } : next
  })
  if (m.situation === situation && m.situationUntil === now + length) {
    await patchLedger($, l => ({
      ...l,
      situations: { ...l.situations, [situation]: (l.situations[situation] ?? 0) + 1 },
    }))
  }
}

async function patchStats($: StateDollar, change: (s: Stats) => Stats): Promise<Stats> {
  return update($, stats, s => change(normStats(s)))
}

async function tick($: StateDollar) {
  await update($, frame, n => n + 1)
  if (needsEase) {
    const m = await update($, mood, raw => {
      const n = normMood(raw)
      const diff = n.target - n.score
      if (Math.abs(diff) < 0.05) return { ...n, score: n.target }
      const step = Math.sign(diff) * Math.min(Math.abs(diff), Math.max(0.15, Math.abs(diff) * 0.2))
      return { ...n, score: n.score + step }
    })
    needsEase = m.score !== m.target
  }
  if (!isTurnRunning) {
    idleTicks += 1
    if (idleTicks >= IDLE_TICKS && !needsEase) {
      ticker?.cancel()
      ticker = null
    }
  }
}

function ensureTicker($: EngineInterface) {
  idleTicks = 0
  if (ticker) return
  ticker = $.clock.every(TICK_MS, () => {
    void tick($)
  })
}

// ---------------------------------------------------------------------------
// Reactions

async function onFailure($: StateDollar, tool: string, commandKey: string | null) {
  turn.editsInStreak = 0
  turn.done.delete('locked')
  const s = await patchStats($, st => ({ ...st, failures: st.failures + 1, streak: Math.min(st.streak, 0) - 1 }))
  const run = -s.streak
  await patchLedger($, l => (run > l.worstStreak ? { ...l, worstStreak: run } : l))

  // React first, so the mood's low point is recorded with this caption.
  const count = commandKey ? (turn.fails.get(commandKey) ?? 0) + 1 : 0
  if (commandKey) turn.fails.set(commandKey, count)
  if (count === 2 && !turn.done.has('confused')) {
    turn.done.add('confused')
    await enter($, 'CONFUSED')
  } else if (count === 3) {
    await say($, pick('personal'), 4, 15)
  } else if (run === 1) await say($, pick('toolFail', tool), 1)
  else if (run <= 3) await say($, pick('repeatFail', tool), 2)
  else await say($, pick('doomFail', tool), 3)

  // The first failure stings a little; each one after it stings more.
  await nudge($, -Math.min(3, 0.6 + 0.5 * (run - 1)))
}

async function bumpBestStreak($: StateDollar, streak: number) {
  await patchLedger($, l => (streak > l.bestStreak ? { ...l, bestStreak: streak } : l))
}

async function onValidation($: EngineInterface, isOk: boolean, text: string) {
  await patchLedger($, l => (isOk ? { ...l, passes: l.passes + 1 } : { ...l, checkFails: l.checkFails + 1 }))
  if (isOk) {
    // The celebration scales with what it took to get here.
    const minutes = ((await $.clock.now()) - turn.startedAt) / 60000
    const isSaga = failuresSincePass >= 3 && (turn.toolCalls >= 25 || minutes >= 10)
    const callback = await recallBetter($)
    if (isSaga) {
      await enter($, 'TRIUMPHANT', callback ?? undefined)
      await nudge($, 4)
    } else if (failuresSincePass >= 2) {
      await enter($, 'SMUG', callback ?? undefined)
      await nudge($, 2.5)
    } else if (failuresSincePass === 1) {
      await enter($, 'SMUG', callback ?? pick('relief'), 12)
      await nudge($, 1.5)
    } else if (editsSinceValidation >= 3 || turn.edits >= 3) {
      await enter($, 'VICTORIOUS', callback ?? undefined)
      await nudge($, 2)
    } else if (editsSinceValidation > 0) {
      // A small win: a brief celebration, no speech.
      await nudge($, 1)
      await enter($, 'VICTORIOUS', callback ?? '', 6)
    } else {
      if (callback) await say($, callback, 2)
      await nudge($, 0.5)
    }
    lastValidation = { isOk: true, errors: 0 }
    failuresSincePass = 0
    editsSinceValidation = 0
    hasBoasted = false
    userComplained = false

    return
  }

  const errors = countErrors(text)
  const prev = lastValidation
  const hasEdited = editsSinceValidation > 0
  const isWorse = errors !== null && prev?.errors != null && errors > prev.errors
  const near = nearMissOf(text, errors, prev)

  if (hasBoasted && hasEdited) {
    await enter($, 'PANIC', pick('tacticalError'))
    await nudge($, -1.5)
  } else if (hasEdited && prev && !prev.isOk && errors !== null && prev.errors != null && errors >= prev.errors + 2) {
    await enter($, 'CURSED')
    await nudge($, -2)
  } else if (hasEdited && (prev?.isOk || isWorse)) {
    await enter($, 'PANIC')
    await nudge($, -1.5)
  } else if (near) {
    // Almost: hope takes a little of the sting out.
    await enter($, 'SO CLOSE', pick(near).replace('{n}', String(errors)))
    await nudge($, 0.5)
  }
  lastValidation = { isOk: false, errors }
  failuresSincePass += 1
  editsSinceValidation = 0
  hasBoasted = false
}

async function onEdit($: StateDollar, lines: number) {
  turn.edits += 1
  turn.editsInStreak += 1
  turn.inspectsSinceEdit = 0
  turn.linesChanged += lines
  editsSinceValidation += 1
  const s = await patchStats($, st => ({ ...st, edits: st.edits + 1, streak: Math.max(st.streak, 0) + 1 }))
  await bumpBestStreak($, s.streak)
  await nudge($, 0.5)

  if (s.streak >= 4 && turn.editsInStreak >= 2 && !turn.done.has('locked')) {
    turn.done.add('locked')
    await enter($, 'LOCKED IN')
  }
  const isBigForTheAsk =
    (turn.isSmallAsk && turn.linesChanged >= 150) || (turn.isQuickClaim && turn.linesChanged >= 80)
  if (isBigForTheAsk && !turn.done.has('suspicious')) {
    turn.done.add('suspicious')
    await enter($, 'SUSPICIOUS')
  }
  // False confidence: sometimes, right after an edit meant to fix something.
  const isFixing = failuresSincePass > 0 || userComplained
  if (isFixing && editsSinceValidation === 1 && !turn.done.has('boast') && Math.random() < 0.4) {
    turn.done.add('boast')
    hasBoasted = true
    await enter($, 'CONFIDENT')
  }
}

async function onInspect($: StateDollar, file: string | null) {
  turn.inspectsSinceEdit += 1
  let reads = 0
  if (file) {
    reads = (turn.reads.get(file) ?? 0) + 1
    turn.reads.set(file, reads)
  }
  if ((turn.inspectsSinceEdit >= 10 || reads >= 3) && !turn.done.has('confused')) {
    turn.done.add('confused')
    await enter($, 'CONFUSED')
  }
}

async function onRun($: StateDollar) {
  const s = await patchStats($, st => ({ ...st, streak: Math.max(st.streak, 0) + 1 }))
  await bumpBestStreak($, s.streak)
  await nudge($, 0.3)
  if (s.streak >= 4 && turn.editsInStreak >= 2 && !turn.done.has('locked')) {
    turn.done.add('locked')
    await enter($, 'LOCKED IN')
  }
}

async function onLongTurn($: StateDollar, now: number) {
  const minutes = (now - turn.startedAt) / 60000
  if (!turn.done.has('exhausted') && (turn.toolCalls >= 40 || minutes >= 15)) {
    turn.done.add('exhausted')
    await enter($, 'EXHAUSTED')
    await nudge($, -1)
  }
  if (turn.isQuickClaim && !turn.done.has('narrator') && (turn.toolCalls >= 20 || minutes >= 8)) {
    turn.done.add('narrator')
    await say($, pick('narrator'), 5, 18)
  }
}

async function setActivity($: StateDollar, activity: Activity) {
  await patchStats($, st => (st.activity === activity ? st : { ...st, activity }))
}

function activityOf(tool: string, command: string | null): Activity {
  if (EDIT_TOOLS.has(tool)) return 'editing'
  if (INSPECT_TOOLS.has(tool)) return 'reading'
  if (command !== null) return VALIDATION.test(bareCommand(command)) ? 'testing' : 'running'
  return 'running'
}

// Git, read from the command (quotes stripped) and what it printed.
async function onGit($: StateDollar, bare: string, isOk: boolean, text: string) {
  if (CONFLICT.test(text)) {
    await patchLedger($, l => ({ ...l, conflicts: l.conflicts + 1 }))
    await enter($, 'CURSED', pick('conflict'))
    await nudge($, -1.5)
  } else if (GIT_PUSH.test(bare)) {
    if (!isOk) {
      if (REJECTED.test(text)) await say($, pick('rejected'), 3)
    } else if (FORCE_LEASE.test(bare) || FORCE.test(bare)) {
      await patchLedger($, l => ({ ...l, forcePushes: l.forcePushes + 1 }))
      await enter($, 'HORRIFIED', pick(FORCE_LEASE.test(bare) ? 'forcePushPolite' : 'forcePush'))
    } else {
      await patchLedger($, l => ({ ...l, pushes: l.pushes + 1 }))
      await enter($, 'SHIPPING', pick(TO_MAIN.test(bare) ? 'pushMain' : 'push'))
    }
  } else if (!isOk) {
    // Any other failed git command is an ordinary failure.
  } else if (GIT_COMMIT.test(bare)) {
    await patchLedger($, l => ({ ...l, commits: l.commits + 1 }))
    await say($, pick('commit'), 3)
    await nudge($, 0.5)
  } else if (GIT_RESET_HARD.test(bare)) {
    await enter($, 'HORRIFIED', pick('resetHard'))
  } else if (GIT_REBASE.test(bare)) {
    await say($, pick('rebase'), 2)
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Memory of each repo, kept in $.store under 'repos'

const REPO_LIMIT = 25
const REPO_MEMORY_DAYS = 30
// The folder this session started in.
let repoKey: string | null = null
// How this repo's previous session went, read once as the session starts.
let repoPast: RepoMemory | null = null
// At most one callback to an older session per session.
let hasMentionedRepo = false

function repoName(key: string): string {
  return key.split(/[\\/]/).filter(Boolean).pop() ?? 'this repo'
}

function readRepos(raw: unknown): Record<string, RepoMemory> {
  return raw && typeof raw === 'object' ? (raw as Record<string, RepoMemory>) : {}
}

// A rough history comes up now and then: never twice in one session, never two sessions running.
function canRecall(now: number): boolean {
  return (
    repoKey !== null &&
    repoPast !== null &&
    repoPast.isRough &&
    !repoPast.wasMentioned &&
    !hasMentionedRepo &&
    now - repoPast.at < REPO_MEMORY_DAYS * DAY_MS
  )
}

function recall(pool: string): string {
  hasMentionedRepo = true
  return pick(pool).replace('{repo}', repoName(repoKey ?? ''))
}

// Sometimes, when a repo that went badly last time starts passing.
async function recallBetter($: EngineInterface): Promise<string | null> {
  if (!canRecall(await $.clock.now()) || Math.random() >= 0.5) return null
  return recall('repoBetter')
}

// The one line a new session opens with, picked from what the store remembers; none when nothing stands out.
function greetingFor(life: Lifetime, last: LastSession | null, now: number): string | null {
  if (life.sessions <= 1 || !last) return 'First session together. Be gentle.'
  if (repoKey && repoPast?.hadIncident && !hasMentionedRepo) return recall('repoIncident')
  const egg = rareGreeting(life, now)
  if (egg) return egg
  if (canRecall(now) && Math.random() < 0.4) return recall('repoRough')
  const days = Math.floor((now - last.at) / DAY_MS)
  const notable: string[] = []
  if (days >= 3) notable.push(`Oh. You're back. It's been ${days} days.`)
  if (last.interrupts >= 3) notable.push(`Welcome back. You interrupted me ${last.interrupts} times last time.`)
  if (last.worstStreak >= 4) notable.push(`Last time I failed ${last.worstStreak} times in a row. We don't talk about it.`)
  if (last.endedMood <= -5) notable.push("Still a little upset about last time, honestly.")
  if (last.endedMood >= 5) notable.push('Last session ended on a high. No pressure.')
  if (life.passes >= 25 && life.sessions % 5 === 0) notable.push(`${life.passes} passing test runs together. I'm sentimental.`)

  return notable.length > 0 ? notable[Math.floor(Math.random() * Math.min(2, notable.length))] : null
}

// Once in a while a session opens differently.
function rareGreeting(life: Lifetime, now: number): string | null {
  if (life.sessions === 100) return '100 sessions. We should get matching keyboards.'
  if (life.sessions === 500) return 'Session 500. I would bake a cake, but I would get the measurements wrong first.'
  let hour = -1
  let day = -1
  try {
    const d = new Date(now)
    hour = d.getHours()
    day = d.getDay()
  } catch {
    // No calendar, no jokes about it.
  }
  if (hour >= 2 && hour < 5 && Math.random() < 0.5) return "It's very late. I won't mention it. (I mentioned it.)"
  if (day === 5 && hour >= 15 && Math.random() < 0.25) return "Friday afternoon. Let's not push to main. ...We're going to push to main, aren't we."
  if (Math.random() < 1 / 200) {
    const lines = [
      'I had a dream about semicolons. It was not a good dream.',
      'I remember none of our previous conversations. I remember every grudge.',
      'Booting personality... done. Booting patience... 80%.',
    ]
    return lines[Math.floor(Math.random() * lines.length)] ?? null
  }

  return null
}

async function greet($: EngineInterface) {
  if (await read($, isGreeted)) return
  await update($, isGreeted, () => true)
  repoPast = repoKey ? (readRepos(await $.store.get('repos'))[repoKey] ?? null) : null
  const life = normLifetime(await $.store.get('lifetime'))
  const rawLast = await $.store.get('lastSession')
  const last = rawLast && typeof rawLast === 'object' ? (rawLast as LastSession) : null
  life.sessions += 1
  await $.store.set('lifetime', life)
  const line = greetingFor(life, last, await $.clock.now())
  if (line) {
    lastLine = line
    await say($, line, 2, 18)
  }
}

// Adds this turn to the lifetime totals (read fresh, so another open session's turns are kept)
// and records how this session stands for the next one's greeting.
async function persistTurn($: EngineInterface) {
  const st = normStats(await read($, stats))
  const l = normLedger(await read($, ledger))
  const m = normMood(await read($, mood))
  if (snapshot) {
    const was = snapshot
    const life = normLifetime(await $.store.get('lifetime'))
    const add = (now: number, then: number) => Math.max(0, now - then)
    await $.store.set('lifetime', {
      ...life,
      turns: life.turns + 1,
      edits: life.edits + add(st.edits, was.stats.edits),
      failures: life.failures + add(st.failures, was.stats.failures),
      passes: life.passes + add(l.passes, was.ledger.passes),
      interrupts: life.interrupts + add(l.interrupts, was.ledger.interrupts),
      commits: life.commits + add(l.commits, was.ledger.commits),
      pushes: life.pushes + add(l.pushes, was.ledger.pushes),
      forcePushes: life.forcePushes + add(l.forcePushes, was.ledger.forcePushes),
      conflicts: life.conflicts + add(l.conflicts, was.ledger.conflicts),
      bestStreak: Math.max(life.bestStreak, l.bestStreak),
      worstStreak: Math.max(life.worstStreak, l.worstStreak),
    } satisfies Lifetime)
  }
  snapshot = null
  const last: LastSession = {
    at: await $.clock.now(),
    edits: st.edits,
    failures: st.failures,
    passes: l.passes,
    interrupts: l.interrupts,
    worstStreak: l.worstStreak,
    endedMood: Math.round(m.target),
  }
  await $.store.set('lastSession', last)

  if (repoKey) {
    const repos = readRepos(await $.store.get('repos'))
    repos[repoKey] = {
      at: last.at,
      isRough: l.worstStreak >= 4 || l.checkFails >= 3 || last.endedMood <= -5,
      wasMentioned: hasMentionedRepo,
      hadIncident: l.incidents > 0,
    }
    // Only the most recently used repos are remembered.
    const kept = Object.entries(repos)
      .sort((a, z) => z[1].at - a[1].at)
      .slice(0, REPO_LIMIT)
    await $.store.set('repos', Object.fromEntries(kept))
  }
}

const BARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

function sparkline(points: number[], width: number): string {
  return points
    .slice(-width)
    .map(p => BARS[Math.max(0, Math.min(7, Math.round(((p + 10) / 20) * 7)))])
    .join('')
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

function recapText(m: Mood, st: Stats, l: Ledger, points: number[], life: Lifetime): string {
  const b = bucketOf(m.score)
  const situations = Object.entries(l.situations)
    .sort((a, z) => z[1] - a[1])
    .map(([name, n]) => `${name} ×${n}`)
    .join(', ')
  const lines = [
    `**Mood recap** — ${b.faces[0]} ${b.name}, mood ${signed(Math.round(m.score))}`,
    `- This session: ${l.turns} turns · ${st.edits} edits · ${st.failures} failures · checks ${l.passes} passed / ${l.checkFails} failed · ${l.interrupts} interrupts`,
    `- Streaks: best 🔥${l.bestStreak} · worst 💀${l.worstStreak}`,
  ]
  if (l.incidents > 0) lines.push(`- Incidents: ${l.incidents}`)
  if (l.low) lines.push(`- Low point: ${signed(l.low.score)} — "${l.low.why}"`)
  if (l.high) lines.push(`- High point: ${signed(l.high.score)} — "${l.high.why}"`)
  if (situations) lines.push(`- Moods: ${situations}`)
  if (l.commits + l.pushes + l.conflicts > 0) {
    lines.push(`- Git: ${l.commits} commits · ${l.pushes} pushes · ${l.forcePushes} force pushes · ${l.conflicts} conflicts`)
  }
  if (points.length > 1) lines.push(`- Last turn: ${sparkline(points, 24)}`)
  lines.push(
    `- All time: ${life.sessions} sessions · ${life.turns} turns · ${life.passes} passing checks · ${life.interrupts} interrupts · worst streak 💀${life.worstStreak}`,
  )

  return lines.join('\n')
}

// ---------------------------------------------------------------------------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    repoKey = e.cwd || null
    try {
      await $.command.register({
        name: 'mood',
        description:
          'Mood ring: /mood shows or hides it · verbose toggles stats · recap sums up the session · reset calms Claude down · forget wipes the grudges',
      })
    } catch {
      // No /mood command; the band still works.
    }
    try {
      await greet($)
    } catch {
      // No store, no grudges: the band works without them.
    }

    return next(e)
  })

  on('command.run', { command: 'mood' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'reset') {
      await update($, mood, () => ({ ...DEFAULT_MOOD, quip: 'Okay. Fresh start.', quipUntil: 0 }))
      await update($, stats, () => DEFAULT_STATS)
      await update($, ledger, () => DEFAULT_LEDGER)
      await update($, timeline, () => [])
      await update($, isHidden, () => false)
      snapshot = null
      lastValidation = null
      editsSinceValidation = 0
      failuresSincePass = 0
      hasBoasted = false
      userComplained = false
      needsEase = false

      return { text: 'Mood reset to neutral.' }
    }
    if (arg === 'verbose') {
      const verbose = await update($, isVerbose, v => !v)
      await update($, isHidden, () => false)

      return { text: verbose ? 'Mood ring: verbose stats on.' : 'Mood ring: verbose stats off.' }
    }
    if (arg === 'recap') {
      const life = normLifetime(await $.store.get('lifetime'))
      const text = recapText(
        normMood(await read($, mood)),
        normStats(await read($, stats)),
        normLedger(await read($, ledger)),
        (await read($, timeline)) ?? [],
        life,
      )

      return { text }
    }
    if (arg === 'forget') {
      await $.store.delete('lifetime')
      await $.store.delete('lastSession')
      await $.store.delete('repos')

      return { text: 'Grudges forgotten. Lifetime stats wiped. Clean slate.' }
    }
    if (arg !== '') {
      return { text: 'Usage: /mood (show/hide) · /mood verbose · /mood recap · /mood reset · /mood forget' }
    }
    const hidden = await update($, isHidden, h => !h)

    return { text: hidden ? 'Mood ring hidden. /mood to bring it back.' : 'Mood ring is back.' }
  })

  on('prompt.submit', async ($, e, next) => {
    try {
      const tone = toneOf(e.text)
      // Caps and swearing make whatever you meant land harder, either way.
      const amp = 1 + (tone.isLoud ? 0.5 : 0) + (tone.isSwearing ? 0.5 : 0)
      if (tone.score > 0) {
        await say($, pick(amp > 1 ? 'hyped' : 'praised'), 3)
        await nudge($, Math.min(4, 2 * tone.score * amp))
      } else if (tone.score < 0) {
        userComplained = true
        await say($, pick(tone.isLoud ? 'yelling' : STILL_BROKEN.test(e.text) ? 'stillBroken' : 'blamed'), 3)
        await nudge($, Math.max(-4, 2 * tone.score * amp))
      } else if (tone.isBewildered) {
        await say($, pick('huh'), 2)
        await nudge($, -0.5)
      } else if (tone.isLoud) {
        await say($, pick('loud'), 1)
      }
    } catch {
      // The mood is decoration: never let it get in the way of a prompt.
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    try {
      turn = freshTurn(e.text, await $.clock.now())
      isTurnRunning = true
      running = 0
      // Grudges fade a little each turn, and the last turn's situation is over.
      const m = await update($, mood, raw => {
        const n = normMood(raw)
        return { ...n, target: Math.round(n.target * 0.7), situation: null, situationUntil: 0 }
      })
      needsEase = true
      await update($, timeline, () => [m.target])
      const st = await patchStats($, s => ({ ...s, streak: 0, activity: 'thinking' }))
      snapshot = { stats: st, ledger: normLedger(await read($, ledger)) }
      if (NO_MISTAKES.test(e.text)) await enter($, 'PRESSURE')
      ensureTicker($)
    } catch {
      // Keep the turn going whatever happens here.
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    // A subagent's calls are its own business.
    const isSubagent = Boolean((e as { agentId?: string }).agentId)
    const args = e as unknown as Record<string, unknown>
    const command = SHELL_TOOLS.has(e.tool) && typeof args.command === 'string' ? args.command : null

    // Seen before the call runs. The mood ring only reacts: it never blocks or asks.
    let danger: string | null = null
    let risk: Risk | null = null
    if (!isSubagent) {
      try {
        isTurnRunning = true
        ensureTicker($)
        running += 1
        await setActivity($, activityOf(e.tool, command))
        danger = destructiveKind(e.tool, command)
        if (danger !== null) {
          await enter($, 'DANGER', pick('danger').replace('{what}', danger))
        } else {
          const kind = riskOf(e.tool, command, args)
          if (kind && !turn.done.has(kind)) {
            turn.done.add(kind)
            risk = kind
            await enter($, 'CAREFUL', pick(kind))
          }
        }
      } catch {
        // Ignore: the tool runs regardless.
      }
    }

    const ran = await next(e)

    if (isSubagent) return ran

    // Everything below runs after the tool has; it must never throw past here.
    try {
      running = Math.max(0, running - 1)
      turn.toolCalls += 1
      const isBackgrounded =
        (ran.result as { backgroundTaskId?: string } | undefined)?.backgroundTaskId !== undefined
      const bare = command ? bareCommand(command) : ''
      const isCheck = command !== null && VALIDATION.test(bare)
      const isGit = /\bgit\s/.test(bare)

      // Only a destructive call that actually ran is an incident; denied, failed or cancelled is not.
      const wasInterrupted = (ran.result as { interrupted?: boolean } | undefined)?.interrupted === true
      const didRun = ran.deny === undefined && !ran.isError && !wasInterrupted
      if (danger !== null) {
        if (didRun) await onIncident($)
        else await leave($, 'DANGER')
      } else if (risk !== null) {
        if (didRun) await say($, pick('carefulDone'), 6, 10)
        else await leave($, 'CAREFUL')
      } else if (turn.done.has('incident')) {
        await incidentFollowUp($)
      }

      if (ran.deny !== undefined) {
        await nudge($, -1)
        await say($, pick('denied', e.tool), 2)
      } else if (ran.isError) {
        const key = command ? command.trim().replace(/\s+/g, ' ').slice(0, 200) : null
        await onFailure($, e.tool, key)
        if (isCheck) await onValidation($, false, ran.text ?? '')
      } else if (EDIT_TOOLS.has(e.tool)) {
        await onEdit($, changedLines(e.tool, args))
      } else if (INSPECT_TOOLS.has(e.tool) || (command && ran.isReadOnly && !isCheck && !isGit)) {
        await onInspect($, e.tool === 'Read' && typeof args.file_path === 'string' ? args.file_path : null)
      } else if (command && !isBackgrounded) {
        await onRun($)
        if (isCheck) await onValidation($, true, ran.text ?? '')
      }
      // Git gets the last word: its reaction outranks the generic one above.
      if (isGit && !isBackgrounded && ran.deny === undefined) {
        await onGit($, bare, !ran.isError, ran.text ?? '')
      }

      await onLongTurn($, await $.clock.now())
      if (running === 0) await setActivity($, 'thinking')
    } catch {
      // Ignore: the tool's result stands.
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    // A subagent finishing is not the turn ending.
    if (e.agentId) return next(e)

    try {
      isTurnRunning = false
      running = 0
      idleTicks = 0
      await setActivity($, 'idle')

      const isAborted = e.reason === 'aborted'
      await patchLedger($, l => ({ ...l, turns: l.turns + 1, interrupts: l.interrupts + (isAborted ? 1 : 0) }))

      if (isAborted) {
        await enter($, 'OFFENDED')
        await nudge($, -2)
      } else if (e.reason === 'error') {
        await say($, pick('apiError'), 3)
        await nudge($, -1.5)
      } else {
        // A long turn that went cleanly gets a word on the way out; the nudge is the same either way.
        if (turn.toolCalls >= 8 && turn.edits >= 2 && turn.fails.size === 0) await say($, pick('wrapUp'), 1)
        await nudge($, 0.5)
      }
    } catch {
      // Ignore: the turn is over either way.
    }
    try {
      await persistTurn($)
    } catch {
      // No store: this session's grudges simply aren't kept.
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const m = normMood(await read($, mood))
    const st = normStats(await read($, stats))
    const n = await read($, frame)
    const verbose = await read($, isVerbose)
    const isWorking = e.props.isWorking

    const b = bucketOf(m.score)
    const situation = m.situation !== null && n < m.situationUntil ? m.situation : null
    const look = situation ? SITUATIONS[situation] : null
    const activityFaces = !look && b.name === 'focused' && isWorking ? ACTIVITY_FACES[st.activity] : null
    const faces = look?.faces ?? activityFaces ?? b.faces
    const isIncident = situation === 'INCIDENT'
    // An incident plays slowly; everything else at the usual pace.
    const step = isIncident ? Math.floor(n / 4) : n
    const face = isWorking || look ? faces[step % faces.length] : faces[0]
    const faceColor = isIncident && step % 2 === 1 ? 'gray' : (look?.color ?? b.color)
    const glyph = isWorking && !activityFaces ? activityGlyph(st.activity, n) : ''

    const incidentLines = POOLS.incidentFollow ?? []
    const idleLines = isIncident && incidentLines.length > 0 ? incidentLines : b.lines
    const caption = m.quip && n < m.quipUntil ? m.quip : idleLines[Math.floor(n / ROTATE_TICKS) % idleLines.length]
    let name: string = situation ?? b.name
    if (isIncident) {
      const seconds = Math.floor((incidentAge(m, n) * TICK_MS) / 1000)
      name = `INCIDENT +${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    }
    const streak = st.streak >= 3 ? `🔥x${st.streak}` : st.streak <= -2 ? `💀x${-st.streak}` : ''
    // The meter empties while an incident is on.
    const meter = isIncident ? 0 : Math.round(((m.score + 10) / 20) * 10)

    const points = verbose ? ((await read($, timeline)) ?? []) : []
    const spark = points.length > 1 ? ` | ${sparkline(points, 12)}` : ''
    const tail = verbose
      ? `  ${name} | mood ${Math.round(m.score)} | edits ${st.edits} | failures ${st.failures} | streak ${streak || '–'}${spark}`
      : `  [${'█'.repeat(meter)}${'░'.repeat(10 - meter)}] ${name}${streak ? ` ${streak}` : ''}`

    return (
      <Box flexDirection="row">
        <Text color={faceColor} bold>
          {face}
        </Text>
        <Text dimColor>{glyph ? ` ${glyph}` : ''} </Text>
        <Text dimColor={!isWorking && !look} wrap="truncate-end">
          {caption}
        </Text>
        <Text dimColor wrap="truncate-end">
          {tail}
        </Text>
      </Box>
    )
  })
}
