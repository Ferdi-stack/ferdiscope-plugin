# Changelog

## 0.1.2 — 2026-11-20
- hooks: `"onFailure": "continue"` su tutti gli hook (SessionStart, PreToolUse, PostToolUse, Stop), così in Code Mode un hook che fallisce o va in timeout non blocca la chiamata.
