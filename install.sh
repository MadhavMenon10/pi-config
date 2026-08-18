#!/usr/bin/env bash
# Symlink this repo's pi resources into ~/.pi/agent so they load from any
# directory — including your Obsidian vault. Symlinks, not copies: edits here
# take effect on the next pi start.
#
#   ./install.sh            install
#   ./install.sh --remove   remove the symlinks again
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
agent="${PI_AGENT_DIR:-$HOME/.pi/agent}"
mode="${1:-install}"

link() { # link <source> <target>
  if [ "$mode" = "--remove" ]; then
    [ -L "$2" ] && rm "$2" && echo "removed $2"
    return 0
  fi
  mkdir -p "$(dirname "$2")"
  if [ -e "$2" ] && [ ! -L "$2" ]; then
    echo "skip    $2 (exists and is not a symlink)" >&2
    return 0
  fi
  ln -sfn "$1" "$2"
  echo "linked  $2"
}

link "$repo/.pi/extensions/learn" "$agent/extensions/learn"

for skill in "$repo"/.pi/skills/*/; do
  link "${skill%/}" "$agent/skills/$(basename "$skill")"
done

for prompt in "$repo"/.pi/prompts/*.md; do
  link "$prompt" "$agent/prompts/$(basename "$prompt")"
done

if [ "$mode" = "--remove" ]; then
  echo "Done. ~/.pi/agent/learn.json was left in place."
  exit 0
fi

if [ ! -f "$agent/learn.json" ]; then
  cp "$repo/.pi/learn.example.json" "$agent/learn.json"
  echo "created $agent/learn.json — set \"vault\" to your Obsidian vault path"
else
  echo "kept    $agent/learn.json"
fi

echo
echo "Next: edit $agent/learn.json, then run pi and use /learn-init"
