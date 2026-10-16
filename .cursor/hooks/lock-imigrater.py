#!/usr/bin/env python3
"""Block Agent/Tab edits to the locked IMigrater contract files."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

LOCKED = (
    "csharp/Abstractions/IMigrater.cs",
    "typescript/src/abstractions/migrater.ts",
    "rust/src/migrater.rs",
)

WRITE_TOOLS = {"write", "strreplace", "delete", "editnotebook"}
READONLY_SHELL = (
    "cat ",
    "head ",
    "tail ",
    "less ",
    "more ",
    "bat ",
    "rg ",
    "grep ",
    "git show ",
    "git diff ",
    "git log ",
    "git blame ",
    "wc ",
    "file ",
    "stat ",
    "ls ",
)


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")


def deny(rel: str) -> dict:
    msg = (
        f"{rel} is locked. IMigrater is the shared contract; "
        "do not edit it. Change an implementation or api.yaml consumers instead."
    )
    return {
        "permission": "deny",
        "user_message": msg,
        "agent_message": msg,
    }


def collect_paths(tool_input: object) -> list[str]:
    if not isinstance(tool_input, dict):
        return []
    found: list[str] = []
    for key in ("path", "file_path", "filePath", "target_file", "targetFile"):
        value = tool_input.get(key)
        if isinstance(value, str) and value.strip():
            found.append(value)
    return found


def locked_match(raw: str, cwd: str, roots: list[str]) -> str | None:
    raw_norm = raw.replace("\\", "/").casefold().rstrip("/")
    locked_cf = [(rel, rel.casefold()) for rel in LOCKED]
    for rel, rel_cf in locked_cf:
        name = Path(rel).name.casefold()
        if raw_norm == rel_cf or raw_norm.endswith("/" + rel_cf) or raw_norm == name:
            return rel

    candidates = []
    path = Path(raw)
    if path.is_absolute():
        candidates.append(path)
    else:
        if cwd:
            candidates.append(Path(cwd) / path)
        for root in roots:
            candidates.append(Path(root) / path)

    for candidate in candidates:
        try:
            resolved = str(candidate.resolve()).replace("\\", "/").casefold()
        except OSError:
            resolved = str(candidate).replace("\\", "/").casefold()
        for rel, rel_cf in locked_cf:
            if resolved.endswith("/" + rel_cf) or resolved.endswith(rel_cf):
                return rel
    return None


def command_hits_locked(command: str) -> str | None:
    text = command.replace("\\", "/").casefold()
    for rel in LOCKED:
        rel_cf = rel.casefold()
        name = Path(rel).name.casefold()
        if rel_cf in text or name in text:
            return rel
    return None


def is_readonly_shell(command: str) -> bool:
    stripped = command.strip().casefold()
    return any(stripped.startswith(prefix) or f"| {prefix}" in stripped for prefix in READONLY_SHELL)


def restore_file(file_path: str, roots: list[str]) -> None:
    repo = Path(roots[0]) if roots else Path.cwd()
    subprocess.run(
        ["git", "checkout", "--", file_path],
        cwd=repo,
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def handle_session_start() -> dict:
    files = ", ".join(LOCKED)
    return {
        "additional_context": (
            "Locked IMigrater contract files (hooks deny Agent/Tab edits): "
            f"{files}. Read them, but do not Write, StrReplace, or Delete them."
        )
    }


def handle_pre_tool_use(data: dict) -> dict:
    tool = str(data.get("tool_name") or "").casefold()
    tool_input = data.get("tool_input")
    cwd = str(data.get("cwd") or "")
    roots = [str(r) for r in data.get("workspace_roots") or [] if r]

    if tool in WRITE_TOOLS:
        for raw in collect_paths(tool_input):
            hit = locked_match(raw, cwd, roots)
            if hit:
                return deny(hit)
        return {"permission": "allow"}

    if tool == "shell" and isinstance(tool_input, dict):
        command = str(tool_input.get("command") or "")
        hit = command_hits_locked(command)
        if hit and not is_readonly_shell(command):
            return deny(hit)

    return {"permission": "allow"}


def handle_before_shell(data: dict) -> dict:
    command = str(data.get("command") or "")
    hit = command_hits_locked(command)
    if hit and not is_readonly_shell(command):
        return deny(hit)
    return {"permission": "allow"}


def handle_after_edit(data: dict) -> dict:
    raw = str(data.get("file_path") or "")
    roots = [str(r) for r in data.get("workspace_roots") or [] if r]
    cwd = str(data.get("cwd") or (roots[0] if roots else ""))
    hit = locked_match(raw, cwd, roots)
    if hit:
        restore_file(raw, roots)
    return {}


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        emit({"permission": "deny", "agent_message": "lock-imigrater hook received invalid JSON."})
        return 2

    if not isinstance(data, dict):
        emit({"permission": "allow"})
        return 0

    event = str(data.get("hook_event_name") or "").casefold()
    if event == "sessionstart":
        emit(handle_session_start())
    elif event == "pretooluse":
        emit(handle_pre_tool_use(data))
    elif event == "beforeshellexecution":
        emit(handle_before_shell(data))
    elif event in {"afterfileedit", "aftertabfileedit"}:
        emit(handle_after_edit(data))
    else:
        emit({})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
