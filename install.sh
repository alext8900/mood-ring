#!/usr/bin/env bash
# Registers this folder with Claude Code: adds it to CLAUDE_CODE_PLUGIN_DIRS and turns on
# CLAUDE_CODE_ENABLE_FUNCTION_HOOKS in the env block of ~/.claude/settings.json.
# Backs the file up first and leaves every other setting alone. Run it again any time; it is idempotent.
# Pass --uninstall to remove the folder from CLAUDE_CODE_PLUGIN_DIRS again.
set -euo pipefail

MOD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETTINGS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
MODE="${1:-install}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is needed to edit $SETTINGS safely. Add these to its \"env\" block by hand:" >&2
  echo "  \"CLAUDE_CODE_PLUGIN_DIRS\": \"$MOD_DIR\"," >&2
  echo "  \"CLAUDE_CODE_ENABLE_FUNCTION_HOOKS\": \"1\"" >&2
  exit 1
fi

mkdir -p "$(dirname "$SETTINGS")"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
cp "$SETTINGS" "$SETTINGS.bak-mood-ring-$(date +%Y%m%d-%H%M%S)"

python3 - "$SETTINGS" "$MOD_DIR" "$MODE" <<'PY'
import json, sys

path, mod_dir, mode = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f:
    settings = json.load(f)
env = settings.setdefault("env", {})
dirs = [d for d in env.get("CLAUDE_CODE_PLUGIN_DIRS", "").split(":") if d]

if mode == "--uninstall":
    dirs = [d for d in dirs if d != mod_dir]
    if dirs:
        env["CLAUDE_CODE_PLUGIN_DIRS"] = ":".join(dirs)
    else:
        env.pop("CLAUDE_CODE_PLUGIN_DIRS", None)
    print(f"Removed {mod_dir} from CLAUDE_CODE_PLUGIN_DIRS.")
    print("CLAUDE_CODE_ENABLE_FUNCTION_HOOKS was left on, in case other mods use it.")
else:
    if mod_dir not in dirs:
        dirs.append(mod_dir)
    env["CLAUDE_CODE_PLUGIN_DIRS"] = ":".join(dirs)
    env["CLAUDE_CODE_ENABLE_FUNCTION_HOOKS"] = "1"
    print(f"mood-ring registered: {mod_dir}")

with open(path, "w") as f:
    json.dump(settings, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY

if [ "$MODE" != "--uninstall" ]; then
  echo "Start a new Claude Code session and type /mood to check it loaded."
fi
