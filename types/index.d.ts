/** A temporary state that overrides the score-based face while it lasts. */
export type Situation =
  | 'CONFUSED'
  | 'SUSPICIOUS'
  | 'LOCKED IN'
  | 'PANIC'
  | 'SMUG'
  | 'EXHAUSTED'
  | 'OFFENDED'
  | 'VICTORIOUS'
  | 'CURSED'
  | 'PRESSURE'
  | 'CONFIDENT'
  | 'SHIPPING'
  | 'HORRIFIED'
  | 'TRIUMPHANT'
  | 'SO CLOSE'
  | 'DANGER'
  | 'INCIDENT'
  | 'CAREFUL'

/** What Claude is doing right now, as far as tool calls tell. */
export type Activity = 'idle' | 'thinking' | 'reading' | 'editing' | 'testing' | 'running'

export type Mood = {
  /** -10 (flipping tables) to 10 (dancing): what the face shows; eases toward `target`. */
  score: number
  /** Where events have pushed the mood; `score` follows it a little each tick. */
  target: number
  /** A one-off reaction to the latest event, shown until `quipUntil`. */
  quip: string | null
  quipUntil: number
  /** A quip only replaces an active one of lower or equal priority. */
  quipPriority: number
  situation: Situation | null
  situationUntil: number
}

export type Stats = {
  /** Session totals. */
  edits: number
  failures: number
  /** This turn: +n for n successes in a row, -n for n failures in a row. */
  streak: number
  activity: Activity
}

export type Moment = { score: number; why: string }

/** This session's story, for /mood recap. */
export type Ledger = {
  turns: number
  passes: number
  checkFails: number
  interrupts: number
  bestStreak: number
  worstStreak: number
  commits: number
  pushes: number
  forcePushes: number
  conflicts: number
  /** Destructive commands that ran successfully. */
  incidents: number
  low: Moment | null
  high: Moment | null
  situations: Record<string, number>
}

/** Kept across sessions in $.store under 'lifetime'. */
export type Lifetime = {
  sessions: number
  turns: number
  edits: number
  failures: number
  passes: number
  interrupts: number
  commits: number
  pushes: number
  forcePushes: number
  conflicts: number
  bestStreak: number
  worstStreak: number
}

/** Kept in $.store under 'lastSession': how the latest session went, for the next one's greeting. */
export type LastSession = {
  at: number
  edits: number
  failures: number
  passes: number
  interrupts: number
  worstStreak: number
  endedMood: number
}

/** Kept in $.store under 'repos', keyed by the folder a session starts in: how the latest session there went. */
export type RepoMemory = {
  at: number
  /** A long failure streak, several failing checks, or a sour ending. */
  isRough: boolean
  /** That session already brought up an older one, so the next stays quiet. */
  wasMentioned: boolean
  /** A destructive command ran there; the next session mentions it once. */
  hadIncident?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'mood-ring': {
      mood: Mood
      frame: number
      isHidden: boolean
      isVerbose: boolean
      stats: Stats
      ledger: Ledger
      /** The mood's target after each event this turn, oldest first. */
      timeline: number[]
      /** Set once the session's welcome-back line has been chosen, so a reload does not greet again. */
      isGreeted: boolean
    }
  }
}
