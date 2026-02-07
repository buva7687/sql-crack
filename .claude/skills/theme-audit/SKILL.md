# Theme Audit Skill

Scan the codebase for theme-breaking patterns — hardcoded dark-only colors that would be invisible on light theme.

## Instructions

1. **Scan for hardcoded white/light colors** used as text/fill outside CSS variable definitions and colored backgrounds:
   ```
   Grep: rgba(255, 255, 255  in src/
   Grep: fill: white  or  fill: #fff  in src/
   Grep: color: white  or  color: #fff  in src/
   Grep: color: #f1f5f9  or  color: #e2e8f0  in src/  (dark theme text colors)
   ```

2. **For each match, classify as:**
   - **OK**: Inside CSS variable definition (`:root { --var: value }`)
   - **OK**: White text on a colored background (`background: var(--accent); color: white`)
   - **BUG**: Text/fill color that would be invisible on light backgrounds

3. **Scan for hardcoded dark backgrounds** that should use theme tokens:
   ```
   Grep: rgba(15, 23, 42  in src/  (dark panel backgrounds)
   Grep: background: #1  in src/  (dark hex backgrounds)
   ```

4. **Check fullscreen toggle parity** — the hide list and restore list in `toggleFullscreen()` in `renderer.ts` must contain the same elements

5. **Report findings** as a table: File | Line | Pattern | Status (OK/BUG) | Suggested Fix

6. If `--fix` is passed as an argument, fix all BUG items using the appropriate CSS variable:
   - Text on node backgrounds: `var(--node-text)` or `var(--text-primary)`
   - Muted/secondary text: `var(--text-muted)`
   - Dim/tertiary text: `var(--text-dim)`
   - Panel backgrounds: `getComponentUiColors(isDark).surface`
