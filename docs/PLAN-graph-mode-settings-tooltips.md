# Plan: Graph Mode Settings, Mode Switcher & Tab Tooltips

## Summary

1. **VSCode settings**: Add `sqlCrack.workspaceGraphDefaultMode` so users can set the default Graph tab mode (files / tables / hybrid).
2. **Mode switcher (UI)**: Add a control **in the Graph tab** (Files | Tables | Hybrid) to switch modes during a session without opening settings.  
   → **Settings** = default when opening/refreshing; **Mode switcher** = quick toggle while viewing. They are complementary.
3. **Tab tooltips**: Replace short `title` values with clearer tooltips that explain each tab’s purpose.

---

## 1. VSCode Extension Setting

### 1.1 Add new configuration

**File:** `package.json` (under `configuration.properties`)

- **Key:** `sqlCrack.workspaceGraphDefaultMode`
- **Type:** `string`
- **Default:** `tables`
- **Enum:** `["files", "tables", "hybrid"]`
- **Enum descriptions:**
  - `files` — "File-level dependency graph. Nodes are SQL files; edges show which files reference tables defined in other files."
  - `tables` — "Table-level dependency graph. Nodes are tables/views; edges show references (SELECT, JOIN, INSERT, etc.)."
  - `hybrid` — "Files plus prominent tables (referenced 3+ times). Mix of file and table nodes."
- **Description:** "Default mode for the Workspace Dependencies Graph tab. Used when the panel loads or when you refresh the index."

### 1.2 Use the setting in code

**Files:** `src/workspace/workspacePanel.ts`

- In `rebuildAndRenderGraph()` (and any other place that calls `buildDependencyGraph`):
  - Replace the hardcoded `'tables'` with a value from config.
  - Use `vscode.workspace.getConfiguration('sqlCrack').get<string>('workspaceGraphDefaultMode', 'tables')`.
  - Validate against `'files' | 'tables' | 'hybrid'`; fall back to `'tables'` if invalid.
- Ensure the graph is built with this mode on:
  - Initial load (via `initialize` → `rebuildAndRenderGraph`).
  - Index refresh (manual refresh, index updates).
  - After "Switch graph mode" from the UI (use the **current** mode from state; see below).

---

## 2. Mode Switcher in the Graph Tab UI

### 2.1 Purpose

- Allow switching between **Files** / **Tables** / **Hybrid** while staying on the Graph tab.
- No need to open Settings.

### 2.2 Where it appears

- **Only when the Graph tab is active.**
- Place it in the **header/toolbar** area, near the existing search box and filter (e.g. left of the search or between title and search).
- Options:
  - **Option A (recommended):** Segmented control or button group: `[Files] [Tables] [Hybrid]` with the current mode selected.
  - **Option B:** Dropdown: "Graph mode: [Files ▼]" with the three options.

### 2.3 State and behavior

- **State:** Keep `currentGraphMode: GraphMode` in `WorkspacePanel` (or equivalent), e.g. `'files' | 'tables' | 'hybrid'`.
- **Initialization:**
  - On panel load / first render: set `currentGraphMode` from `sqlCrack.workspaceGraphDefaultMode`.
  - When the user changes the setting (and we optionally listen to config changes): we can either apply it only on next refresh, or immediately rebuild (see 2.5).
- **When user switches mode in UI:**
  1. Update `currentGraphMode`.
  2. Rebuild graph with `buildDependencyGraph(index, currentGraphMode)`.
  3. Re-render the Graph view (same tab).
  4. Update the mode switcher UI to reflect the new mode.

### 2.4 Filter-type dropdown vs mode switcher

- **Existing filter-type dropdown** (Files / Tables / Views / External): filters **which nodes are shown** in the current graph (hide/show by type). Keep as is.
- **Mode switcher**: changes **what the graph represents** (file vs table vs hybrid topology). Distinct feature.

### 2.5 Config changes (optional)

- Listen for `vscode.workspace.onDidChangeConfiguration` and `affectsConfiguration('sqlCrack.workspaceGraphDefaultMode')`.
- If we handle it: optionally rebuild the graph and update the mode switcher when the **default** changes (e.g. only when Graph tab is active), so that the UI stays in sync with the new default.  
- This can be a follow-up if we want to keep the first iteration smaller.

---

## 3. Tab Tooltips

### 3.1 Current state

- Tab buttons use `title="Dependency Graph"`, `"Data Lineage"`, etc.
- These are short and don’t explain **what** each tab is for.

### 3.2 New tooltips (replace `title`)

| Tab    | Suggested tooltip text |
|--------|------------------------|
| **Graph** | "Dependency overview: file- or table-level graph of workspace dependencies. Switch mode (Files/Tables/Hybrid) to change what nodes represent." |
| **Lineage** | "Data lineage: search for a table, view, or CTE to see its upstream sources and downstream dependencies." |
| **Tables** | "Table explorer: browse all tables, views, and CTEs with schema details and connection counts." |
| **Impact** | "Impact analysis: select a table or view and a change type (MODIFY/RENAME/DROP) to see affected dependencies." |

- Keep tooltips concise (1–2 sentences). We can shorten slightly if needed for space.
- Use the same strings for both `title` and any custom tooltip implementation (e.g. `data-tooltip`) so we have a single source of truth.

### 3.3 Where to change

- **File:** `src/workspace/workspacePanel.ts`
- **Location:** Where the four view tabs are rendered (the `button.view-tab` elements with `data-view="graph"`, etc.).
- **Change:** Replace the existing `title="..."` with the new tooltip text for each tab.

### 3.4 Accessibility

- Ensure the tab buttons remain focusable and that the tooltip is associated with the button (e.g. via `title` or `aria-describedby`), so screen readers can announce them.

---

## 4. Implementation Order

1. **VSCode setting**  
   - Add `sqlCrack.workspaceGraphDefaultMode` in `package.json`.  
   - Read it in `workspacePanel` and use it whenever building the graph (replace hardcoded `'tables'`).

2. **Mode switcher**  
   - Add `currentGraphMode` state.  
   - Add UI (buttons or dropdown) in the Graph tab header.  
   - On mode change: rebuild graph with new mode, re-render, update switcher.  
   - Initialize `currentGraphMode` from the new setting.

3. **Tab tooltips**  
   - Update the four tab `title` attributes (and any other tooltip mechanism) with the new explanatory text.

4. **Optional**  
   - Config change listener for `workspaceGraphDefaultMode`.  
   - README update to document the new setting and the mode switcher.

---

## 5. Files to Touch

| File | Changes |
|------|---------|
| `package.json` | Add `sqlCrack.workspaceGraphDefaultMode` under `configuration.properties`. |
| `src/workspace/workspacePanel.ts` | Read setting; add `currentGraphMode`; use mode in `buildDependencyGraph`; add mode switcher HTML; handle mode-change messages; update tab `title` attributes. |
| `src/workspace/handlers/messageHandler.ts` (or equivalent) | Handle new message, e.g. `switchGraphMode` { mode: 'files' \| 'tables' \| 'hybrid' }, and call rebuild + re-render. |
| `src/workspace/indexManager.ts` | No change (graph building stays in `workspacePanel` / `dependencyGraph`). |
| `README.md` | Optional: document the new setting and the Graph tab mode switcher. |

---

## 6. Clarifications

- **Settings vs mode switcher**
  - **Settings:** Default mode when the panel loads or when the index is refreshed.
  - **Mode switcher:** In-UI control to change mode on the fly.  
  Both are in scope; they work together.

- **Scope of “mode”**
  - Only the **Graph** tab has these modes (files / tables / hybrid).  
  - Lineage, Tables, and Impact tabs are unchanged.

---

## 7. Out of Scope (for this plan)

- Changing default mode in the **analysis** (e.g. making "files" the default) — that’s a product decision; this plan only adds the **ability** to choose via settings and UI.
- Changes to Lineage / Tables / Impact behavior or layout.
- New graph layout or visualization features.

---

## 8. Testing Checklist

- [ ] Setting `sqlCrack.workspaceGraphDefaultMode` to `files` / `tables` / `hybrid` correctly changes the graph on load and on refresh.
- [ ] Mode switcher appears only when Graph tab is active.
- [ ] Switching mode updates the graph and the switcher state immediately.
- [ ] After switching mode, refresh still uses the **setting** as default (or documented behavior if we decide otherwise).
- [ ] Tab tooltips show the new descriptions and work on hover (and with keyboard focus if applicable).
- [ ] Invalid or missing config value falls back to `tables` and does not throw.

---

*Document version: 1.0 — for review before implementation.*
