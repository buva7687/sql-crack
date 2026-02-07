# UX Fix Skill

Systematically investigate and fix batched UX bug reports.

## Instructions

When the user provides UX issues to fix:

1. **Create a task list** from the reported issues using TaskCreate
2. **Investigate all issues first** before making any changes:
   - For each issue, identify the relevant files using the Key File Map in CLAUDE.md
   - Read the specific code sections involved
   - Note the root cause (hardcoded color? missing element? layout overlap? state leak?)
3. **Fix issues in dependency order** — if one fix affects another, do the foundational fix first
4. **After each fix:**
   - Run `npx tsc --noEmit` to verify no type errors
   - Mark the task as completed
5. **After all fixes:**
   - Run `npx jest --silent` to verify all tests pass
   - Grep for related patterns that might have the same bug elsewhere:
     - `rgba(255, 255, 255` for hardcoded white fills
     - `color: white` or `fill: white` outside colored backgrounds
     - `color: #f1f5f9` or `color: #e2e8f0` outside CSS variable definitions
   - Report any additional instances found
6. **Summarize** what was fixed and how to test each fix manually
