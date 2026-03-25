@echo off
start "Claude Code" cmd /k "claude"
start "Gemini CLI" cmd /k "gemini"
start "OpenCode" cmd /k "opencode"
start "Codex" cmd /k "codex"
start "Dev Terminal" cmd /k "cd /d %~dp0 && npm run dev"