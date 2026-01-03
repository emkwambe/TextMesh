# Claude Code Master Prompts

> Copy and paste these into Claude Code to give full context before any task.

---

## 🚀 Sprint 2 Execution Prompt (Use This Now)

```
Read these files in order, then execute Sprint 2:

1. .claude/CLAUDE.md (project context)
2. .claude/PUBLIC-USE.md (public + groups pillars)
3. .claude/SPRINT-2.md (current sprint plan)

Start with Phase 1: Schema Updates. Commit after each phase.
```

---

## 📖 Context-Only Prompt (When Starting Fresh Session)

```
Read .claude/CLAUDE.md and .claude/SPRINT-2.md to understand the project before I give you tasks.
```

---

## 🔧 Quick Task Prompt (After Context is Loaded)

```
Continue Sprint 2. Current phase: [PHASE NUMBER]. 
Reference .claude/SPRINT-2.md for requirements.
```

---

## 🆘 Recovery Prompt (If Build Breaks)

```
Build is failing. Read .claude/CLAUDE.md for conventions. 
Run pnpm build, analyze errors, fix them following Prisma/TypeScript rules in the docs.
Target: 47/47 packages.
```

---

## 📋 New Sprint Prompt Template (Future Use)

```
Read .claude/CLAUDE.md for project context.
Read .claude/SPRINT-[N].md for current sprint plan.
Execute starting with Phase 1. Commit after each phase.
```

---

## Quick Reference

| File | Purpose |
|------|---------|
| `.claude/CLAUDE.md` | Project overview, conventions, architecture |
| `.claude/PUBLIC-USE.md` | Public content + Groups (both pillars) |
| `.claude/SPRINT-2.md` | Current sprint tasks and requirements |
| `.claude/BACKLOG.md` | Future sprints (reference only) |

---

## Tips

1. **Always read context first** — prevents wasted effort
2. **Commit after each phase** — easy rollback if needed
3. **Maintain 47/47 build** — don't break existing code
4. **Use Prisma enum imports** — never string literals
