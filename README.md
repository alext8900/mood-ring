# mood-ring

An animated Claude face above your Claude Code prompt that reacts to how the turn is going.

```
(⌐■_■)  Pretty sure that was it.                    [██████░░░░] CONFIDENT
(⊙_⊙;)  So that confidence aged badly.              [███░░░░░░░] PANIC
(⌐■_■)  It passes. I will now pretend this was the plan.   [███████░░░] SMUG 🔥x3
```

It gets grumpier when commands fail, smug when tests finally pass, suspicious when a "quick change" turns into a huge diff, offended when you interrupt it, and nervous when it pushes to main. It also notices how you talk to it.

> **Early access.** mood-ring is built on Claude Code's function hooks, an early-access plugin API. The Claude Code desktop app loads it as is; the terminal CLI needs `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` (see below). A future Claude Code release may change the API and break it. Built and tested on Claude Code 2.1.285.

## Install

### Option 1: plugin marketplace

In Claude Code:

```
/plugin marketplace add alext8900/mood-ring
/plugin install mood-ring@mood-ring
```

In the desktop app, that's it: start a new session and type `/mood`.

In the terminal, Claude Code also needs function hooks turned on. Without this, the plugin shows as enabled but never loads. Add it to the `env` block of `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"
  }
}
```

Start a new session and type `/mood`.

### Option 2: clone and run the installer

```bash
git clone https://github.com/alext8900/mood-ring ~/.claude/mods/mood-ring
~/.claude/mods/mood-ring/install.sh
```

`install.sh` backs up `~/.claude/settings.json`, adds the folder to `CLAUDE_CODE_PLUGIN_DIRS` and turns on `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`. It changes nothing else and is safe to run twice. To update, `git pull`; to uninstall, run `install.sh --uninstall` and delete the folder.

Use one option, not both, or the mod loads twice.

## Commands

| Command | What it does |
| --- | --- |
| `/mood` | Hide or show the face |
| `/mood verbose` | Swap the meter for stats: mood, edits, failures, streak, and a sparkline of the turn |
| `/mood recap` | The session's story: turns, checks, streaks, low and high points, git activity, all-time totals |
| `/mood reset` | Calm Claude back to neutral |
| `/mood forget` | Wipe everything it remembers between sessions |

## What moves the mood

- **Your tone.** Praise and slang cheer it up; complaints, all caps and "still broken" bring it down.
- **Failures.** Failed commands build a losing streak; the same command failing three times gets personal.
- **Checks.** Tests, type checks, builds and linters. Celebrations scale with what it took: a quick pass is a nod, a pass after a long, messy debugging session is a parade.
- **Near misses.** One failing test left, or the error count collapsing, gets its own reaction.
- **Git.** Commits, pushes, force pushes, rebases and conflicts each get a reaction.
- **Long turns and scope creep.** It gets tired, and it notices when a "quick fix" isn't.
- **Memory.** It remembers rough sessions per repo and occasionally brings them up. Rarely.

There are a few things it doesn't tell you about.

## DANGER and INCIDENT

mood-ring watches for commands that delete data:

- **DANGER** shows just before a clearly destructive command runs: `DROP TABLE` through a database client, `dropdb`, `prisma migrate reset`, `TRUNCATE`, `DELETE` or `UPDATE` with no `WHERE`, `terraform destroy`, `fly destroy`, `rm -rf` on `/`, `~` or `.`, and similar.
- **INCIDENT** follows only if that command succeeded. Denied, failed or cancelled commands get the normal reaction instead. It drops the jokes and says plainly what's happening until the next turn.
- **CAREFUL** marks risky but not destructive work: deploys, migrations, scoped SQL writes, `sudo`, edits to `.env`, auth or CI files.

Detection is deliberately conservative: build and temp folders (`dist`, `node_modules`, `/tmp`) are ignored, `DELETE … WHERE` is only CAREFUL, and a word that merely appears in a commit message or a `grep` doesn't count.

**mood-ring is not a safety tool.** It never blocks, delays or asks about anything. Use Claude Code's permission settings for that.

## Privacy

Everything stays on your machine, in the plugin's local store: lifetime counts, how your last session went, and a short memory of the 25 most recent folders you've used Claude Code in (folder path, date, whether it went badly). `/mood forget` deletes all of it. Nothing is sent anywhere.

## Development

```bash
claude plugin validate .   # checks the manifest and hooks module the way Claude Code will load them
claude plugin test .       # runs tests/mood.test.ts against the engine
```

For editor types, run `/plugin-types .` in a Claude Code session in this folder. It writes `.claude-plugin/types/`, which is git-ignored.

## License

MIT
