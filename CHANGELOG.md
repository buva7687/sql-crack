# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

> Planned publish date: February 22, 2026.

### Added

- **Teradata SQL dialect support**: Teradata is now a first-class dialect in SQL Crack.
  - Added `Teradata` to `SqlDialect` type union, VS Code settings dropdown, and SQL Flow toolbar dialect selector.
  - Teradata-specific function registry: aggregates (XMLAGG, KURTOSIS, SKEWNESS, CORR, STDDEV family, REGR family, APPROX_COUNT_DISTINCT), window functions (CUME_DIST, PERCENT_RANK, PERCENTILE_CONT, PERCENTILE_DISC), and TVFs (TABLE, XMLTABLE, STRTOK_SPLIT_TO_TABLE).
  - Dialect auto-detection with 13 Teradata-specific patterns: `VOLATILE TABLE`, `MULTISET/SET TABLE`, `PRIMARY INDEX`, hash functions (`HASHROW`, `HASHBUCKET`), `COLLECT STATISTICS`, `CREATE MACRO`, `JOIN INDEX`, `LOCKING ... FOR ACCESS`, `SAMPLE`, `SEL` shorthand, `RANGE_N`/`HASHBAKAMP`, `NORMALIZE`, `RENAME TABLE/VIEW`.
  - Teradata preprocessing (15 rewrite steps): `SEL` → `SELECT`, `REPLACE VIEW` → `CREATE OR REPLACE VIEW`, `LOCKING ... FOR ACCESS` stripping, `VOLATILE`/`MULTISET`/`SET`/`GLOBAL TEMPORARY` stripping, `PRIMARY INDEX(...)` stripping, `ON COMMIT PRESERVE/DELETE ROWS` stripping, `SAMPLE`/`TOP n` stripping, `NORMALIZE` stripping, `WITH DATA`/`WITH NO DATA` stripping, `QUALIFY` stripping (shared depth-aware scanner), `UPDATE t FROM s` → comma-join rewrite, `WITHIN GROUP(...)` stripping, `RANGE BETWEEN INTERVAL` safe fallback, bare `DATE` → `CURRENT_DATE`, `WHEN MATCHED AND` conditional stripping, reserved-word alias backtick quoting.
  - Teradata session commands: `DATABASE`, `COMMENT ON`, `COLLECT STATISTICS`, `RENAME TABLE/VIEW`.
  - Teradata-specific syntax warnings when Teradata patterns are used in non-Teradata dialects.
  - Teradata → MySQL proxy mapping for AST parsing.
  - Added Teradata example files (`examples/teradata-basic.sql`, `examples/teradata-advanced.sql`, `examples/teradata-ddl.sql`).
- **Oracle SQL dialect support**: Oracle is now a first-class dialect in SQL Crack.
  - Added `Oracle` to `SqlDialect` type union, VS Code settings dropdown, and SQL Flow toolbar dialect selector.
  - Oracle-specific function registry: aggregates (LISTAGG, COLLECT, XMLAGG, MEDIAN, STATS_MODE), window functions (RATIO_TO_REPORT, CUME_DIST, PERCENT_RANK, PERCENTILE_CONT, PERCENTILE_DISC), and TVFs (XMLTABLE, JSON_TABLE, TABLE, XMLSEQUENCE).
  - Dialect auto-detection with 10 Oracle-specific patterns: `CONNECT BY`, `ROWNUM`, `NVL`/`DECODE`, `MINUS`, sequence `.NEXTVAL`/`.CURRVAL`, `(+)` outer joins, `SYSDATE`/`SYSTIMESTAMP`, `PIVOT`, `AS OF SCN/TIMESTAMP` (flashback), `MODEL DIMENSION/MEASURES/RULES`.
  - Oracle preprocessing: strips `(+)` outer join operators, rewrites `MINUS` → `EXCEPT`, strips `START WITH`/`CONNECT BY`/`ORDER SIBLINGS BY` hierarchical clauses, strips `PIVOT`/`UNPIVOT` clauses, strips `AS OF SCN/TIMESTAMP` flashback queries, strips `MODEL` clauses, strips `RETURNING ... INTO` bind variables.
  - Oracle optimizer hints (`/*+ ... */`) detected and surfaced as info hints.
  - Oracle-specific syntax warnings when Oracle patterns are used in non-Oracle dialects.
  - Oracle → PostgreSQL proxy mapping for AST parsing (PostgreSQL is the closest supported parser dialect).
  - `PL/SQL` alias normalization for the `defaultDialect` setting.
  - Added Oracle complex example file (`examples/oracle-complex.sql`) with 10 queries covering hierarchical queries, (+) joins, MINUS, DECODE/NVL, sequences, and ROWNUM.
- **Unified workspace preprocessing**: Workspace extractors (`referenceExtractor`, `schemaExtractor`) now apply all dialect preprocessing transforms via `preprocessForParsing()` — PostgreSQL (AT TIME ZONE, type-prefixed literals), Snowflake (deep path collapse), CTE hoisting, GROUPING SETS rewrite, and Oracle syntax. Previously workspace extractors had no preprocessing.
- **TVF registry coverage expansion**: Added missing table-valued functions across dialects:
  - Redshift: `UNNEST`, `GENERATE_SERIES`
  - Hive: `JSON_TUPLE`, `PARSE_URL_TUPLE`
  - Athena: `SEQUENCE`, `FLATTEN`
  - Snowflake: `EXTERNAL_TABLE_FILES`, `INFER_SCHEMA`
  - BigQuery: `ML.TRAIN`, `VECTOR_SEARCH`
- **Parser compatibility preprocessors**:
  - `GROUPING SETS` rewrite support for parser compatibility.
  - Snowflake deep path collapsing for `:<path>` chains with 3+ levels.
- **Unrecognized TVF hinting**: FROM-clause function calls that are not recognized as table-valued now emit a low-severity quality hint with guidance to add custom TVFs.
- **Additional dialect auto-detection coverage**: Added parser auto-detection patterns for Hive, Trino, Athena, Redshift, and SQLite to improve cross-dialect retry selection on mixed SQL corpora.
- **Workspace lineage discoverability features**:
  - Filter/search table list in lineage start view.
  - Export selected node lineage as JSON from the workspace context menu.
  - Expanded lineage keyboard affordances for node/column navigation and quick actions.
- **Workspace graph context-menu productivity action**:
  - Added `Copy Connections` action to copy a formatted upstream/downstream dependency summary for the selected node.
- **SQL Flow keyboard easter eggs**: Added Matrix and zero-gravity keyboard-triggered modes in the SQL Flow webview.
- **SQ badge for expression subquery source tables**: Tables discovered via expression subqueries (WHERE/SELECT/HAVING/ON) now display a violet **SQ** badge, dashed stroke, dashed edge, and legend entry — visually distinguishing them from direct FROM/JOIN table references.
- **Circular dialect dropdown**: Toolbar dialect selector now renders options in circular order starting from the active dialect, so switching between adjacent engines is continuous.

### Changed

- **Large-file refactor completed (Phases 1-6)**: Split major orchestrators into focused modules while preserving behavior and public workflows.
  - `sharedStyles.ts`: 4,620 -> 68 lines (style assembler + extracted style modules)
  - `sqlParser.ts`: 6,269 -> 1,071 lines (orchestrator + parser module tree)
  - `renderer.ts`: 9,686 -> 3,040 lines (orchestrator + extracted rendering/feature/interaction/navigation modules)
  - `clientScripts.ts`: 4,183 -> 173 lines (script assembler + extracted script fragments)
  - `workspacePanel.ts`: 2,568 -> 780 lines (orchestrator + extracted panel modules)
  - `toolbar.ts`: ~2,000 -> 475 lines (orchestrator + extracted toolbar modules)
- **Workspace message routing hardening**: Typed workspace message protocol and host router now explicitly handle PNG save/error round-trips from webview exports.
- **Shared escaping helper adoption**: Consolidated additional non-renderer HTML escaping paths to `src/shared/stringUtils.ts`.
- **SQL Flow icon**: Replaced graph-node circle icon with bold **SC** letterform SVGs (path-based, compatible with VS Code and Cursor). Menu entries now use the custom SC icon instead of the generic `$(database)` codicon.
- **PIVOT detection shared**: Renamed `hasTSqlPivot` → `hasPivot` in dialect detection; PIVOT now scores for both TransactSQL and Oracle.
- **Toolbar pin affordance refresh**: Replaced the pin glyph with a cleaner pushpin icon and reordered controls to keep pin-related actions grouped (`View location` → `Pin visualization as new tab` → `Pinned tabs`).
- **Examples compare documentation**: Expanded `examples/README.md` with a dedicated "Compare with Baseline Query" section and updated wording to reference the compare button label (instead of legacy `⇆` symbol text).
- **Workspace scope behavior**: Workspace analysis/indexing now respects the selected subfolder scope more consistently across scanning and interactive UX flows.
- **Lineage graph presentation and controls**:
  - Improved viewport utilization for sparse lineage graphs (layout spacing and auto-fit behavior).
  - Removed the redundant lineage legend toggle icon near zoom controls while preserving the `L` shortcut and bottom legend controls.
  - Simplified lineage stats: removed redundant node count badge and relationship count; upstream/downstream counts now include external nodes with a parenthetical annotation.
  - Removed CTEs from lineage list view — CTEs are query-scoped and their referenced tables/views already appear as lineage nodes.
  - Moved direction filter buttons (Upstream/Both/Downstream) into the graph header row to save vertical space.
- **Workspace Dependencies Graph UX refresh (navigation-first model)**:
  - Graph header now keeps only Graph/Lineage/Impact tabs and two explicit graph modes (Files/Tables) with mode-specific context copy.
  - Added persistent graph state chips/reason text so users can see when search/focus/trace filters are reducing visibility.
  - Added search next/previous navigation controls with match count feedback and current-match highlighting.
  - Selection panel actions were streamlined to task language: `Trace in Lineage`, `Analyze in Impact`, `Show tables in file`, `Open file`.
  - Added context actions in the Selection area for graph-level exploration controls: `Focus neighbors`, `Trace upstream`, `Trace downstream`, `Clear graph state`.
  - Introduced local opt-in Workspace UX instrumentation hooks for key graph actions/events (no server dependency required).
- **Workspace dependency-debugging flow improvements**:
  - Edge selection now exposes a "Why this edge?" drilldown with sampled file/line/context references and quick-open for the first reference.
  - Issues view now includes `Show in graph` actions that route directly back to Graph with prefilled query context.
  - Graph search no-result state now offers fuzzy suggestions for likely table/view labels.
  - Selection panel now includes a two-endpoint shortest-path flow: `Set as start`, `Set as end`, `Show path`, and `Clear path`.
- **Workspace graph polish and discoverability updates**:
  - Merged keyboard hints into a collapsible `Shortcuts` panel inside the bottom legend bar.
  - Removed the redundant Graph-mode `?` help affordance to reduce competing help surfaces.
  - Context menu actions now hide unavailable upstream/downstream items in Files mode instead of graying them out, reducing dead-option friction.
  - Graph empty-state copy is now mode-specific (`No files match this search` / `No tables/views match this search`).
  - Graph search debounce aligned to SQL Flow timing for more consistent typing behavior.
  - Graph search clear now provides visual flash feedback in the search control to explain why results changed.
  - Removed visible `L` keyboard legend hint from the primary rail while retaining the `L` keybinding.
  - Added a small top offset to the Graph sidebar `Export` section for cleaner separation from Selection actions when the Selection panel expands.
- **Workspace lineage & navigation trust improvements**:
  - "Why am I seeing this graph?" panel is now context-aware: shows active mode, parse issue counts, active search filters, empty-index and empty-graph explanations, and stale-index warnings instead of static guidance copy.
  - Selection panel depth now reads "N levels up, M levels down (visible)" with a tooltip clarifying it reflects rendered graph edges, not full system lineage depth.
  - Edge evidence panel now offers "View all N references" expand/collapse instead of truncating at 6 with a static "+N more" label.
  - Impact cross-view prefill now shows "Prefilled from graph — select a change type and click Analyze Impact to run" with a subtle button pulse, instead of silent prefill.
  - Index freshness badge now includes a dirty/clean signal: shows "(N changed)" when files have changed since the last index build, and promotes to `stale` level even if the index is recent.
  - Lineage search wording corrected from "tables" to "tables/views" for show-all button and empty-filter message.
  - Lineage empty-state tip updated from "more SQL files you have open" to guidance about refreshing the index and workspace scope.
  - External nodes now show "Trace in Lineage (limited)" with a tooltip explaining the external reference constraint, and empty-lineage states for external nodes provide explicit "not indexed" messaging instead of generic "no relationships" text.
- **SQL Flow batch result navigation UX**:
  - Replaced the failed-only dropdown summary with compact inline status chips (`ok`, `failed`, `partial`) in the existing batch-tabs row (no new panel/row).
  - Added scoped navigation state so batch controls (`⏮`, `◀`, `▶`, `⏭`) and keyboard shortcuts (`[` and `]`) navigate within the active status scope.
  - Batch tab card rendering now honors active scope (show only matching query cards), including auto-jump into scope when current selection is outside the selected status set.
  - Retained disabled zero-count chips for status visibility without adding extra UI footprint.

### Fixed

- **Context menu lineage routing false negatives**: Context menu upstream/downstream actions now use the canonical node ID (`contextMenuTarget.id`) instead of reconstructing it from `type:lowercase(label)`, preventing "no upstream/downstream" false negatives for schema-qualified, aliased, or case-sensitive nodes. The `analyzeImpact` action now passes the actual node type instead of hardcoding `'table'`.
- **Impact cross-links misroute for views**: Impact analysis report cross-link buttons ("View Lineage Graph", "View Details") now derive node ID prefix and `data-node-type` from the actual target type (table vs view) instead of hardcoding `table:` and `data-node-type="table"`. The `ImpactReport.target.type` union was extended to include `'view'`.
- **Cloud node not draggable**: Removed internal pan mousedown/mousemove/mouseup listeners from cloud `nestedSvg` that intercepted whole-cloud drag via the cloud rect. Wheel zoom for internal navigation is preserved.
- **Cloud arrow disconnects when dragging CTE node**: Removed `updateCloudAndArrow` call from the node drag path — the cloud is a child of the node group, so the group transform already moves it correctly. Calling `updateCloudAndArrow` with absolute coordinates inside the transformed group caused the arrow to overshoot.
- **Search not clearing when text is deleted**: The search input listener now calls `onClearSearch()` when the input value becomes empty, resetting breadcrumbs and highlights (same as pressing Escape).
- **R key now triggers full refresh**: Pressing `R` dispatches a `sql-crack-reset-view` event that triggers a full re-parse and re-render (same as the toolbar refresh button), collapsing all expanded cloud nodes and resetting positions.
- **Parse error context clarity**: Parse errors now include the offending SQL source line in both the error badge tooltip and the canvas error overlay, and stored parse-error SQL context was expanded (200 → 500 chars) for more reliable source-line extraction.
- **Cross-dialect retry reliability**: Reduced dialect false positives from time literals like `00:00:00` and ensured dialect auto-retry applies compatibility preprocessing (`AT TIME ZONE`, type-prefixed literals) before regex fallback.
- **CONNECT BY + ORDER SIBLINGS BY stripping**: The preprocessing regex incorrectly terminated at `ORDER SIBLINGS BY` (treating it as a regular `ORDER BY`). Replaced with a keyword-scanning approach that correctly identifies and strips all three hierarchical clause types.
- **CONNECT BY inside CTE bodies**: Hierarchical clause stripping now works correctly within CTE subqueries.
- **T-SQL warning too broad for Oracle**: The T-SQL syntax warning was fully suppressed when Oracle was selected. Now only the ambiguous PIVOT signal is suppressed; T-SQL-only constructs (CROSS APPLY, TOP) still warn on Oracle dialect.
- **RETURNING INTO cross-statement corruption**: The `RETURNING ... INTO` regex could match across semicolons into a subsequent statement (e.g., `UPDATE ... RETURNING id; INSERT INTO ...`). Constrained to single-statement scope with `[^;]` guard.
- **GROUP BY clause scanning performance**: `findGroupByClauseEnd()` no longer runs regex matching against `substring()` at each character offset (quadratic behavior). The scan now uses a linear keyword boundary check.
- **Hint duplication on retry preprocessing**: Parser compatibility hints are now deduplicated when parse retry applies the same rewrites.
- **Keyboard sibling cycling at same depth (`←/→`)**: Sibling navigation now falls back to visual row/column bucketing when semantic `depth` metadata is too strict, so side-by-side nodes (for example `customer_segments` and `regional_metrics` in `examples/demo-showcase.sql`) can be cycled reliably.
- **Focus direction shortcuts (`U` / `D` / `A`)**: Selecting focus direction now immediately enables focus mode when a node is selected and refreshes the breadcrumb label (`Focus: Upstream/Downstream/All`) to match the active mode.
- **WHERE node condition rendering (`[object Object]`)**: Filter details now format nested AST operands correctly (wrapped `column_ref`, `expr_list`/`IN`, function/unary operands), preventing `[object Object]` placeholders in Q1 (`examples/demo-showcase.sql`) and similar queries.
- **Compare overlay label collisions**: Removed/ghost diff nodes are now repositioned when they overlap active nodes, preventing stacked/overlapping text in side-by-side compare mode.
- **Duplicate repeated-table performance hints**: Prevented overlapping hints for the same table/count pair (for example `scanned 2 times` + `is accessed 2 times`) by deduplicating repeated-scan/access signals across analyzers.
- **Aggregate detail placeholders in CASE expressions**: Aggregate node details now format `EXTRACT(...)` and CASE `ELSE` branches correctly, eliminating residual `?` placeholders in Query 3-style expressions.
- **Function usage stats from scalar subqueries**: Query Stats now includes aggregate/scalar functions found inside expression subqueries (for example Query 4 `COUNT(*)` scalar subquery), not just top-level SELECT expressions.
- **Workspace lineage export reliability**:
  - Export no longer fails when a workspace node cannot be resolved to a lineage node ID; unresolved nodes now export with empty upstream/downstream arrays and resolution metadata.
  - Added defensive guards around graph payload column extraction and column-search matching to prevent malformed data from breaking export/search paths.
- **Workspace lineage parity and shortcut correctness**:
  - Fixed upstream count mismatch between lineage cards and lineage detail views by aligning internal-node counting and depth usage.
  - Fixed `Cmd/Ctrl+C` conflicts where copy actions could incorrectly trigger column-lineage shortcuts.
  - Escape now correctly clears active column trace and returns the lineage view to normal state.
  - Arrow-key column navigation now auto-updates the column trace panel without requiring Enter.
  - Suppressed overlapping table tooltip behavior while column trace panel is active.
- **Workspace export/render guards**:
  - SVG/PNG export now strips `foreignObject` content and clears pan/zoom transform from the cloned SVG to prevent off-center or failed raster exports.
  - Restored HTML entity handling in workspace tooltip sanitizer paths.
- **Workspace lineage/state robustness**: Added null/race guards and state-preservation fixes across lineage loading, minimap/tooltip bounds, and cross-view transitions.
- **Workspace Graph onboarding overlap on first load**:
  - Prevented stacked first-load surfaces by default-hiding the explain panel unless explicitly opened.
  - Hid graph overlay chrome (keyboard hints and zoom toolbar) while empty/welcome overlays are active.
  - Updated the welcome-card `Why am I seeing this?` action to transition cleanly (dismiss welcome -> open explain) instead of rendering both states simultaneously.
- **Workspace Graph header search collisions**:
  - Reworked graph search sizing to be shrink-safe under dense header controls.
  - Removed ambiguous `Scope: current mode` suffix to avoid a “double search field” impression and compacted control sizing.
- **Graph->Lineage node routing (`table_0` fallback issue)**:
  - Fixed graph-to-lineage handoff so workspace graph IDs (for example `table_0`) are resolved to lineage IDs (for example `table:customer_summary_2024`) before rendering lineage graph views.
  - Threaded node metadata (`nodeLabel`, `nodeType`) through `getLineageGraph` messaging to support deterministic host-side resolution.
- **Graph->Lineage trace reliability for searched/external nodes**:
  - Fixed `Trace in Lineage` and node double-click flows to always include stable node metadata from the selected graph node when action attributes are missing.
  - Expanded lineage node resolution to match qualified/unqualified names (for example `carriers` resolving to `raw.carriers`) to prevent false empty-lineage states such as `external_90 has no upstream or downstream relationships`.
- **Workspace Graph back-navigation and state consistency**:
  - Back button behavior now consistently returns to Graph for Graph-origin lineage navigation while preserving `Back to Lineage` for in-lineage drilldowns.
  - Restored graph selection state persistence across tab switches by saving graph view state before highlight cleanup.
  - Mode switches now clear stale selection details/cross-links and reset path status so old node details do not linger while the new mode renders.
- **Workspace export dropdown consistency**:
  - Normalized advanced export option styling so `SVG` onward uses the same left alignment and text contrast as `Copy to clipboard (PNG)` and `Save as PNG`.
- **Workspace graph interaction runtime regression**:
  - Removed stale `focusBtn` references from graph scripts that could break interaction flows after moving focus actions to the Selection panel.
- **Workspace graph search count visibility**:
  - Fixed search-count rendering by explicitly using inline display state so `X of Y` feedback is visible when matches exist.
- **Aggregate window function parser compatibility (`FILTER ... OVER`)**:
  - Added preprocessing support to strip `FILTER (WHERE ...)` clauses before parsing, preventing failures on valid SQL patterns like `max(col) FILTER (WHERE ...) OVER (...)`.
- **CTE hoisting with quoted CTE names**:
  - Fixed nested CTE hoisting when CTE names are quoted (`"name"`, `` `name` ``, `[name]`) so multi-block nested `WITH` queries hoist reliably.
- **Indented `SEL` not detected or preprocessed**: Both detection and preprocessing regexes only matched `SEL` at absolute line start or after `;`. Indented Teradata queries (`  SEL id FROM t`) now correctly detected and rewritten.
- **`LOCKING TABLE <object> FOR ACCESS` not stripped**: The LOCKING regex only handled the bare `LOCKING TABLE FOR ACCESS` form without an object name. Object-qualified forms like `LOCKING TABLE customers FOR ACCESS` are now stripped correctly.
- **Teradata reserved words leaked into global scope**: Words like `sample`, `normalize`, `locking` were added to the global `SQL_RESERVED_WORDS` set, causing `SELECT * FROM sample` to return no table references in MySQL mode. Teradata-specific reserved words are now dialect-scoped.
- **QUALIFY clause stripping depth-awareness**:
  - `stripQualifyClauses()` now uses depth-aware scanning (`findQualifyClauseEnd()`) instead of flat regex terminator matching. Previously, `ORDER BY` inside `OVER()` parentheses was incorrectly treated as a clause boundary, breaking queries like `QUALIFY ROW_NUMBER() OVER (PARTITION BY x ORDER BY y) <= 3`.
- **Snowflake syntax preprocessing compatibility**:
  - Added Snowflake compatibility rewrites for parser ingestion: `QUALIFY` stripping, `IFF()` rewrite to `CASE`, trailing-comma cleanup before `FROM/WHERE`, and `::TYPE` cast suffix stripping.
- **Teradata advanced query partial parsing in SQL Flow**:
  - Eliminated partial fallbacks for Teradata MERGE statements in `examples/teradata-advanced.sql` (Q1/Q2) by adding a Teradata MERGE compatibility parse path that preserves source/target/branch structure without setting `partial`.
  - Eliminated partial fallback for Teradata XML aggregation query patterns (Q23) by extending Teradata preprocessing with:
    - `XMLAGG(... ORDER BY ...)` argument rewrite (ORDER BY stripped at depth 0 inside XMLAGG),
    - XML method-chain stripping for `.RETREIVE(...)` / `.RETRIEVE(...)`.
  - Result: `examples/teradata-advanced.sql` now parses as `35/35` non-partial statements under Teradata dialect.
- **IN-subquery source tables missed for `expr_list` AST shape**: `findSubqueriesInExpression()` did not handle arrays emitted by node-sql-parser for `IN (SELECT ...)` expressions, causing subquery source tables (e.g., `departments`) to be silently dropped from the graph.

### Documentation

- Updated `README.md` Architecture Overview to a single current tree (removed duplicate architecture trees).
- Added Cursor installation instructions to `README.md` with Open VSX Registry link and publisher-qualified search name.

### Tests

- Added `UndoManager.getInitial()` unit tests (5 cases: basic, after undo/redo, empty, cleared, max history eviction).
- Added interaction regression characterisation tests guarding against re-introduction of cloud drag, arrow disconnect, search clear, and reset view bugs.
- Added regression coverage for parse-error source-line propagation (index → toolbar tooltip → renderer overlay), including absolute-to-relative statement line mapping.
- Added parser regressions for cross-dialect auto-retry behavior (including `examples/postgres_complex.sql`) and time-literal detection safety.
- Added workspace lineage routing regression for external graph IDs with unqualified labels resolving to qualified lineage node names.
- Added Teradata dialect detection tests (VOLATILE TABLE, MULTISET, PRIMARY INDEX, LOCKING, SAMPLE, SEL shorthand, hash functions, COLLECT STATS, macros, JOIN INDEX, RANGE_N, NORMALIZE, RENAME).
- Added Teradata preprocessing tests (SEL rewrite, LOCKING stripping, VOLATILE/MULTISET/SET stripping, PRIMARY INDEX stripping, SAMPLE/TOP stripping, QUALIFY depth-aware stripping, REPLACE VIEW rewrite, UPDATE FROM comma-join rewrite, bare DATE → CURRENT_DATE, reserved-word alias quoting, WITHIN GROUP stripping, RANGE BETWEEN INTERVAL fallback, combined constructs).
- Added Teradata end-to-end parsing tests (basic SELECT, JOINs, CTEs, window functions, MERGE, DML, QUALIFY, UPDATE FROM, DATE keyword, PERCENTILE_CONT with WITHIN GROUP).
- Added Oracle dialect detection tests (CONNECT BY, (+) joins, ROWNUM + sequences, NVL/DECODE, comment masking).
- Added Oracle preprocessing tests (outer join removal, MINUS → EXCEPT, START WITH/CONNECT BY stripping, ORDER SIBLINGS BY, CTE-nested hierarchical queries, string literal safety).
- Added Oracle end-to-end parsing tests (basic SELECT, WHERE, CTEs, JOINs, window functions, (+) join preprocessing, MINUS rewriting).
- Added Oracle PIVOT/UNPIVOT preprocessing tests (basic, nested subquery, combined with (+) joins).
- Added Oracle FLASHBACK (AS OF SCN/TIMESTAMP) preprocessing tests.
- Added Oracle MODEL clause preprocessing tests (DIMENSION BY/MEASURES/RULES, PARTITION BY, column-name false positive guard).
- Added Oracle RETURNING INTO preprocessing tests (single/multiple bind vars, multi-line, cross-statement boundary safety).
- Added Oracle optimizer hints detection test.
- Added `preprocessForParsing()` unified tests (PostgreSQL, GROUPING SETS, Oracle, Snowflake, CTE hoisting, no-op passthrough).
- Added `PL/SQL` → `Oracle` normalizeDialect mapping test.
- Added unit tests for preprocessing transforms (GROUPING SETS edge cases, Snowflake path/time-literal safety).
- Added unit tests for unrecognized TVF hint behavior.
- Expanded registry tests for new dialect TVFs.
- Added integration coverage for `GROUPING SETS` rewrite and Snowflake deep-path collapsing.
- Added keyboard navigation regression tests for sibling cycling fallback when visual peers have different `depth` metadata.
- Added integration assertions for `U`/`D`/`A` focus direction shortcuts and `setFocusMode()` auto-enable breadcrumb behavior.
- Added condition extractor unit regressions for wrapped `column_ref` operands and `IN` `expr_list` formatting.
- Added demo showcase integration regression ensuring Q1 WHERE details never contain `[object Object]`.
- Added compare-view regression coverage for removed ghost-node repositioning to avoid overlap with active nodes and other ghost nodes.
- Added regression test coverage for repeated-table hint deduplication (`scanned` vs `accessed`) so the same table is not reported twice.
- Added aggregate extraction regressions for CASE + `EXTRACT(...)` formatting and function-usage tracking from scalar subqueries.
- Added workspace regressions for:
  - subfolder-scoped analysis behavior and mode-switch search reset,
  - lineage keyboard discoverability and navigation behavior,
  - upstream/downstream count parity for internal lineage nodes,
  - depth-aware lineage overview counts,
  - Escape clear-path handling for active column trace,
  - unresolved-node lineage export payload behavior.
- Added Workspace Graph UX regression coverage for:
  - first-load overlay/toolbar overlap prevention behavior,
  - graph action routing and context button availability in Selection actions,
  - host-side graph-node -> lineage-node ID resolution for `getLineageGraph` requests,
  - export dropdown advanced-option alignment/contrast parity,
  - issues-page `Show in graph` routing and query handoff,
  - edge metadata serialization for graph SVG and edge-selection rendering,
  - shortest-path action wiring and Selection panel path-controls presence.
- Added parser regressions for:
  - aggregate window expressions using `FILTER (WHERE ...) OVER (...)`,
  - `stripFilterClauses()` behavior boundaries (presence, absence, string-literal safety),
  - quoted-name nested CTE hoisting,
  - Snowflake syntax preprocessing transforms (`QUALIFY`, `IFF`, trailing commas, `::TYPE` casts).
- Added SQL Flow batch navigation regressions for scoped status navigation:
  - `[` / `]` wiring through scoped adjacency helpers,
  - compact `ok/failed/partial` chip rendering and scope toggling in batch tabs.
- Added Teradata regression coverage for:
  - MERGE compatibility parsing without `partial`,
  - XMLAGG ORDER BY + `.RETREIVE(...)` preprocessing,
  - dialect support guard ensuring Teradata MERGE no longer degrades to partial parse.
- Added IN-subquery source table regression test (`expr_list` AST shape) and advanced subquery example file (`examples/advanced_subqueries.sql`).
- Added toolbar dialect circular-order regression tests for helper ordering and re-render wiring.

## [0.3.7] - 2026-02-13

### Fixed

- **SQL Server dialect in settings** ([#46](https://github.com/buva7687/sql-crack/issues/46)): Users can now select "SQL Server" directly in the `sqlCrack.defaultDialect` setting. Previously only "TransactSQL" was available, which was confusing since the toolbar shows "SQL Server".
- **Default layout not applying on first open** ([#46](https://github.com/buva7687/sql-crack/issues/46)): The `sqlCrack.defaultLayout` setting (e.g., `"horizontal"`) now takes effect immediately when opening the visualization. Previously the parser's vertical positions were used regardless of the setting.
- **Node drag disconnects edges** ([#46](https://github.com/buva7687/sql-crack/issues/46)): Dragging nodes in horizontal, force, or radial layouts no longer detaches edges. Edge recalculation now uses the layout-aware `calculateEdgePath()` instead of hardcoded vertical-only math.
- **PostgreSQL column-lineage expression rendering regression**: Calculated expressions such as `round(... / nullif(...), 4)` no longer render as `[object Object](...)`. Function names are now unwrapped from nested AST identifier objects before expression formatting.
- **Parse error context clarity**: Parse errors now include the offending SQL source line in both the error badge tooltip and the canvas error overlay, making line/column diagnostics actionable when comments/whitespace shift line numbers. The stored SQL context for parse errors was increased from 200 to 500 characters to improve source-line extraction reliability.
- **Cross-dialect fallback parsing reliability**: Reduced false positives in dialect detection where time literals like `00:00:00` could be misclassified as dialect-specific path syntax. Also ensured dialect auto-retry applies compatibility preprocessing when needed (`AT TIME ZONE`, type-prefixed literals), reducing unnecessary regex fallback on valid SQL.
- **False "Unused CTE" hints for chained CTEs**: CTE-to-CTE references (e.g., `high_value_customers` referencing `customer_totals` via JOIN) were not detected, causing valid CTEs to be flagged as unused. The detection now recursively checks CTE children including join nodes, and correctly strips `WITH RECURSIVE` prefixes.

### Tests

- Added `normalizeDialect` unit tests for settings alias mapping.
- Added source-level regression tests for default layout initialization, `updateNodeEdges` wiring, and `calculateEdgePath` layout branch coverage.
- Added `package.json` schema tests verifying "SQL Server" enum presence and enum/description array length parity.
- Added a PostgreSQL column-lineage regression test to ensure calculated expressions keep readable function names (`round`, `nullif`) and never contain `[object Object]`.
- Added webview wiring regression tests for parse-error source line propagation (index -> toolbar tooltip -> renderer overlay), including absolute-to-relative statement line mapping.
- Added parser regressions for auto-retry behavior (including `examples/postgres_complex.sql`) plus dialect-detection coverage ensuring time literals are not misclassified as path syntax.

## [0.3.6] - 2026-02-12

### Fixed

- **PostgreSQL `AT TIME ZONE` and type-prefixed literals**: Queries using `AT TIME ZONE 'America/Chicago'`, `timestamptz '...'`, `timestamp '...'`, `date '...'`, `time '...'`, or `interval '...'` literals now parse via the full AST instead of falling back to regex. A new `preprocessPostgresSyntax()` transform rewrites these constructs before parsing, preserving column lineage and precise relationships.

### Tests

- Added unit tests for PostgreSQL syntax preprocessing (`AT TIME ZONE` removal, type-prefix stripping, string-literal masking) and an integration test with a 3-CTE query using `date_bin()`, `AT TIME ZONE`, and `timestamptz` literals.

## [0.3.5] - 2026-02-12

### Fixed

- **Column lineage trace panel clipped when details panel collapsed**: Clicking a column to trace lineage wrote content into a collapsed 24px-wide details panel, rendering the lineage path as an unreadable narrow sliver. Both `showLineagePath()` and `updateDetailsPanel()` now auto-expand the panel before displaying content.
- **Demo video not rendering on GitHub/marketplace**: Replaced `<video>` embed with a 1200px GIF that renders on GitHub READMEs and the VS Code marketplace.

### Tests

- Added regression tests verifying the details panel expand guard is called before writing lineage and node details content.

## [0.3.4] - 2026-02-11

### Fixed

- **SQL Flow theme ignoring `defaultTheme` setting**: The SQL Flow webview always opened in dark mode regardless of the `sqlCrack.advanced.defaultTheme` setting. The extension host now reads the setting (matching the workspace panel behavior), and the renderer initializes `isDarkTheme` from `window.vscodeTheme` instead of hardcoding `true`.

### Tests

- Added regression tests for SQL Flow theme initialization: verifies `visualizationPanel.ts` reads `advanced.defaultTheme` and `renderer.ts` initializes theme from `window.vscodeTheme`.

## [0.3.3] - 2026-02-11

### Added

- **High-contrast mode**: Detect `ColorThemeKind.HighContrast` and apply HC CSS overrides for both SQL Flow and workspace webviews.
- **Workspace lineage test suite**: 92 unit tests covering FlowAnalyzer, ColumnLineageTracker, ImpactAnalyzer, and LineageBuilder (lineage coverage 9% to 70%).

### Changed

- **Monospace font consistency**: Migrated all 35 bare monospace declarations to `MONO_FONT_STACK` / `var(--font-mono)`.
- **Emoji arrow replacement**: Replaced emoji arrows with inline SVG in workspace clientScripts.
- **SqlDialect imports**: Workspace modules now use local re-exports instead of reaching into webview types.
- **Dead code removal**: Removed unused `handlePinnedTabSwitch` code path.

### Fixed

- **Cursor command visibility**: Hardened cursor command enablement and icon fallbacks.
- **Unhandled rejection in visualize command**: Wrapped async handler in extension.ts.
- **Panel disposal order**: Dispose listeners before panel to prevent post-disposal message throws; added disposed guard to `_postMessage`.
- **Pinned tab error feedback**: Show error when `openPinnedTab` context is missing instead of silently failing.
- **Parser type guard**: Added `typeof` string check before `stmt.type.toUpperCase()` to prevent crashes on non-string AST values.
- **CTE extraction**: Fixed `extractCteDefinitions` whitespace skipping to use masked array for block comment transparency.
- **Regex fallback parser rewrite**: Detect all CTEs, two-pass JOIN chain extraction, CTE-to-source edges, and correct stats counting.
- **SQL validation**: Reject empty/whitespace-only input in `validateSql`.
- **Webview rendering hardening**: Hardened workspace webview rendering, path handling, message handler, and file security.

### Security

- **Tooltip sanitizer**: Removed `style` from attribute whitelist (class-only) and added `on*` event handler stripping safety net.
- **Hints badge XSS**: Escaped innerHTML in hints badge label.

### Tests

- Added sqlFormatter comment edge-case tests.
- Added 92 workspace lineage unit tests (FlowAnalyzer, ColumnLineageTracker, ImpactAnalyzer, LineageBuilder).

## [0.3.2] - 2026-02-11

### Added

- **Collapsible Performance Hints panel**: Added a minimize/expand toggle to the Performance Hints header. Collapsed state persists across query switches.
- **Collapsible Query Stats panel**: Added the same minimize/expand toggle to the Query Stats header, with independent persistent state.
- **Minimap drag-to-pan in SQL Flow**: Clicking or dragging inside the minimap now pans the main viewport to that position, matching the existing Workspace Dependencies minimap behavior.
- **Debug logging in catch blocks**: Added `console.debug()` to all previously-empty `catch {}` blocks across 11 files for easier troubleshooting.
- **Contributor DX**: Updated `CONTRIBUTING.md` with `npm install`, `tsc --noEmit`, and `jest` requirements before committing.

## [0.3.1] - 2026-02-11

### Added

- **Auto-hoist nested CTEs**: Snowflake/Tableau-style `FROM ( WITH cte AS (...) SELECT ... )` subqueries are automatically rewritten to top-level CTEs before parsing, enabling full AST-based visualization instead of regex fallback.
- **Auto-retry dialect on parse failure**: When the selected dialect fails to parse, the parser now detects syntax patterns and retries with a more appropriate dialect (e.g., Snowflake syntax auto-retries with Snowflake parser).
- **INSERT...SELECT and DML write ops visualization**: Inner queries in INSERT...SELECT, UPDATE...FROM, DELETE...USING, and MERGE statements now generate full flow nodes with write-operation badges.
- **`#` comment support**: MySQL-style hash line comments are now stripped during parsing and dialect detection.
- **Marketplace keywords**: Added SQL/discovery keywords in `package.json` to improve extension discoverability in VS Code Marketplace search.

### Changed

- **Walkthrough metadata cleanup**: Removed empty walkthrough `media.markdown` placeholders from onboarding steps to avoid blank media blocks.
- **New default preferences**: Default settings now open SQL Flow in `tab` view, use `lines` grid style, and use `light` theme preference.

### Fixed

- **Unclosed block comments**: Block comments missing `*/` no longer cause the comment stripper to consume the rest of the SQL.
- **Broken edge recovery**: Edge rendering gracefully handles missing source/target nodes instead of failing silently.
- **Workspace watcher exclusion parity**: Incremental workspace watcher now skips `node_modules`, `.git`, `dist`, and `build`, matching scanner exclusion behavior.
- **Renderer null-guard hardening**: Replaced unsafe cloud map non-null assertions with safe state/offset initialization helpers.
- **Renderer lifecycle cleanup**: Cleanup now disconnects renderer resize observers/timers and removes injected style elements.
- **SVG accessibility metadata**: Main query canvas SVG now has `role="img"` and an `aria-label`.
- **Wheel event listener options**: Workspace graph and lineage wheel handlers now use `{ passive: false }` where `preventDefault()` is required.

### Tests

- Added unit tests for CTE hoisting (basic, multiple CTEs, merge with existing top-level WITH, string/comment masking, nested subqueries in CTE bodies, end-to-end parsing).
- Added regression tests for watcher exclude behavior, renderer polish guards, canvas accessibility metadata, wheel listener passive options, and package metadata checks.

## [0.3.0] - 2026-02-10

### Added

- **Undo/redo layout history**: Added bounded history for layout-affecting actions (drag, zoom, reset, layout, focus mode) with toolbar controls and keyboard shortcuts (`Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`).
- **Query comparison mode**: Added side-by-side baseline/current compare overlay with added/removed/changed node highlighting and stats delta summary.
- **Inline VS Code diagnostics**: SQL Crack parser hints now surface as editor diagnostics, with a Quick Fix action (**Show in SQL Flow**) to open the visualization directly. Gated behind `sqlCrack.advanced.showDiagnosticsInProblems` (off by default) to reduce noise.
- **Typed message protocol**: Added discriminated union types (`SqlFlowWebviewMessage`, `SqlFlowHostMessage`, `WorkspaceWebviewMessage`, `WorkspaceHostMessage`) for compile-time safety on all webview↔host message handlers.
- **Impact analysis `addColumn` change type**: Workspace impact analyzer now supports `addColumn` alongside `modify`, `rename`, and `drop`.
- **MIT license in manifest**: Added `license` field to `package.json` for marketplace compliance.
- **UI listener lifecycle cleanup**: Added AbortController-based listener teardown for legend bar, command bar, layout picker, and export dropdown module re-initialization paths.
- **Compare mode KPI example pair**: Added `compare-mode-kpi-before.sql` and `compare-mode-kpi-after.sql` to demonstrate correlated-subquery baseline vs CTE/join refactor diffs.

### Changed

- **Toolbar controls**: Added compare toggle and undo/redo controls with active/disabled state synchronization.
- **Diagnostics lifecycle**: Diagnostics are refreshed on open/save/auto-refresh, and cleared for closed documents or empty/non-SQL content.
- **Documentation sync**: Updated root and examples README content to reflect roadmap-delivered features/settings (compare mode, undo/redo, diagnostics, parser reliability, and current workspace view model).
- **Node border contrast**: Increased SQL Flow node border visibility — light theme `#E2E8F0`→`#94A3B8`, dark theme `#2A2A2A`→`#475569` — for better node definition without competing with semantic strokes.
- **Workspace zoom controls cleanup**: Replaced refresh-style "Reset view" icon with crosshair/target icon on Graph tab; removed redundant "Reset view" button from lineage zoom controls.
- **Legend default behavior**: Query-view legend now defaults to visible for first-time users while preserving saved dismissal state.
- **Layout picker visuals**: Replaced unicode layout glyphs with shared SVG icons for consistent rendering across platforms.
- **Accessibility consistency**: Unified reduced-motion handling across legend bar, breadcrumb bar, export dropdown, command bar, toolbar, and renderer via a shared motion utility.

### Fixed

- **Workspace graph focus/trace wiring**: Fixed edge data attribute mismatch so focus mode, trace traversal, and neighbor highlighting work reliably.
- **Workspace lineage XSS hardening**: Escaped dynamic lineage result fields and error content before HTML injection.
- **Custom extension watcher parity**: Workspace watcher now tracks configured SQL extensions (e.g. `.hql`, `.bteq`, `.tpt`) and recreates watcher on setting changes.
- **Index build race conditions**: Added in-flight `buildIndex()` promise guard and queue coordination to prevent concurrent build/result clobbering.
- **Dark node metadata contrast**: Reduced dark-theme muted node text emphasis for clearer hierarchy against node backgrounds.
- **Command bar theme source**: Removed hardcoded theme class checks in favor of callback-based theme resolution.
- **Toolbar overflow resize thrash**: Debounced overflow recalculation for high-frequency resize events.
- **Typecheck regressions in UI polish follow-up**: Fixed legend reduced-motion variable scope and browser timeout handle typing.
- **Edge dash pattern rendering**: Moved dash pattern handling into edge rendering flow so edge styles are restored correctly after hover and no orphaned scope code remains.
- **Transformation badge contrast**: Replaced hardcoded white fills with contrast-aware text coloring for improved light-theme legibility.
- **Viewport fit stability**: Clamped fit-view dimensions/scale to prevent upside-down node rendering on small viewports.
- **Resizable panel behavior**: Preserved preferred panel width so hints/details resizing behaves predictably across window resizes.
- **Parser resilience**: Added safe string handling to prevent `.toLowerCase()` crashes when AST values are non-string objects.
- **Hints panel interaction**: Hint rows now allow copy/select text (switched from button semantics to text-friendly container rendering).
- **Hints panel/legend overlap regressions**: Hints panel now reflows above the legend when legend height changes (toggle, wrap, viewport resize), with viewport-clamped panel/list heights.
- **Lineage fit-to-screen**: Fixed "Fit to screen" button in Data Lineage view — click handler was passing the MouseEvent as the `isAutoFit` parameter, causing the deduplication guard to silently block manual fits.
- **Diagnostics config key mismatch**: Fixed `advanced.*` config key resolution for diagnostics settings.

### Tests

- Added unit/regression coverage for undo manager behavior, compare mode wiring/diff logic, diagnostics mapping, and extension diagnostics wiring.
- Added regression coverage for Phase 1/2 roadmap fixes, including legend default visibility, dark muted color token, layout picker SVG icon usage, command bar theme callback usage, reduced-motion module coverage, and toolbar resize debounce logic.
- Added DOM-style panel layout regression tests for legend-height growth and viewport clamping of the performance hints panel.

## [0.2.1] - 2026-02-06

### Added

- **CREATE TABLE AS SELECT (CTAS)**: Inner SELECT is now processed to generate flow nodes and optimization hints, matching CREATE VIEW behavior.
- **Recursive CTE labels**: CTE nodes show `WITH RECURSIVE <name>` and "Recursive Common Table Expression" description when the recursive flag is set.
- **`||` dialect suggestion**: Parse errors involving the `||` concatenation operator now suggest switching to PostgreSQL or MySQL dialect.
- **Error line numbers**: Parse error badge tooltips show `Q1 (line 12): <message>` when line information is available.
- **Hints hierarchy module** (`hintsHierarchy.ts`): Sorts optimization hints by severity/type impact; provides compact badge state (ok/warning/error) for toolbar summary.
- **Warning indicator module** (`warningIndicator.ts`): Isolates performance warning logic; renders inline top-right triangle markers on nodes instead of floating circles.
- **Column lineage UX module** (`columnLineageUx.ts`): Centralizes column lineage discoverability (banner text, enable/trace guards).
- **SQL snippet module** (`sqlSnippet.ts`): Extracts SQL fragments for node tooltips with line labels.
- **Toolbar hints summary badge**: `⚡` button in toolbar showing hint count with color-coded status.
- **Column lineage active banner**: Non-blocking banner below toolbar indicating active column lineage mode.
- **Workspace export consolidation** (`exportUtils.ts`): Unified export dropdown with Copy Mermaid option; `generateWorkspaceMermaid()` utility.
- **Workspace SVG icons**: Replaced emoji icons with inline SVG across graph, lineage, table explorer, and impact views.
- **Workspace column trace onboarding**: One-time "Click a column to trace lineage across tables" hint on first column expand, persisted via localStorage.
- **Workspace expand-columns tooltip**: Collapsed lineage nodes show "Click to focus · Double-click to expand columns" on hover.
- **Workspace column lineage info panel**: Shows column name + source table, upstream/downstream counts, mini flow summary (`users.id → orders.user_id → report.customer_id`), and "Clear trace" button.
- **Workspace keyboard navigation**: Expanded column rows are keyboard-focusable with Enter to trace.
- **Workspace lineage legend + keyboard hints**: Integrated keyboard shortcut hints into lineage view legend.
- **One-time help button pulse**: Toolbar `?` button pulses once on first run to aid discoverability.
- **Full SQL preview tooltip cue**: Node tooltips mention the `S` shortcut for full SQL preview.
- **Workspace legend re-open affordance**: Added a dedicated legend toggle button to the Graph zoom toolbar so users can re-open the legend without keyboard-only discovery.
- **Lineage legend re-open affordance**: Added a dedicated legend toggle button to lineage zoom controls for the same show/hide behavior in lineage detail view.

### Changed

- **Node tooltips**: Footer now shows "Click to select · Double-click to zoom · Right-click for actions".
- **Warning badges on nodes**: Replaced floating circle badges with compact top-right triangle indicators.
- **Render state reset**: Switching queries now fully resets column lineage, search, breadcrumbs, and focus mode.
- **Overflow menu**: Fully theme-aware in light mode (button, dropdown rows, hover states).
- **Breadcrumb bar**: Uses theme-aware colors; suppresses legacy popup during column lineage mode.
- **Column lineage panel**: Themed scrollbar; explicit close button in header.
- **Workspace graph nodes**: Added `node-bg` class and `node-accent` strip so CSS theme variables apply correctly.
- **Workspace graph background**: Uses dot-grid pattern matching lineage view instead of solid background.
- **Workspace Graph legend UX**: Moved from sidebar section to a bottom frosted legend strip; removed the old sidebar legend block.
- **Lineage legend UX**: Replaced top-right collapsible legend panel with a bottom-anchored horizontal legend strip.
- **Legend copy cleanup**: Removed the misleading keyboard-style `× Dismiss` hint in the workspace legend strip; `L` remains the documented shortcut and `×` remains a click action.

### Fixed

- **Phantom LIMIT node**: PostgreSQL, Snowflake, Trino, and Redshift no longer show a spurious LIMIT node when no LIMIT clause exists. The "No LIMIT clause" optimization hint now correctly appears for these dialects.
- **Click-outside zoom reset**: Clicking empty canvas now restores the full view when zoomed into a node (previously required Escape).
- **Auto-refresh for non-`.sql` files**: `.hql`, `.ddl`, `.pgsql`, untitled files, and other non-`.sql` documents now trigger auto-refresh when the visualization panel is open.
- **Parse error positioning**: Parser diagnostics now preserve absolute line/column coordinates so editor and badge navigation land on the correct source location.
- **Fullscreen UI recovery**: Exiting fullscreen now consistently restores toolbar wrapper, breadcrumb bar, and parse error badge placement.
- **Toolbar popover overlays**: Toolbar menus render as floating overlays, preventing clipping and misplaced controls in constrained layouts.
- **Minimap sync stability**: Minimap visibility and viewport sync are now stable during query/view transitions.
- **Stats & hints panel overlap**: Panels dynamically shift above the legend bar when it is visible instead of being hidden behind it.
- **Column lineage banner overlap**: Banner no longer stretches full-width or captures clicks across query tabs; uses `pointer-events: none` with only the close button interactive.
- **Column lineage Escape dismiss**: Escape now closes column lineage mode from any focus context (SVG, document, or the lineage panel itself).
- **Snowflake DELETE parsing**: Snowflake DELETE/MERGE statements that fail native grammar now fall back to PostgreSQL AST parsing.
- **Light-theme toolbar**: Overflow button and dropdown rows use correct light-mode colors.
- **Breadcrumb/filter state**: Filter chips no longer leak stale state across re-renders.
- **Theme-toggle jitter**: Switching themes no longer triggers tab jump/flicker artifacts in the webview.
- **Collapsed sidebar canvas usage**: Graph now auto-fits after sidebar collapse/expand so newly available canvas space is used immediately.
- **Zoom control displacement**: Removed incorrect `zoom-toolbar` top offset that was applied when the bottom legend was visible.

### Tests

- Added regression coverage for:
  - workspace legend toolbar toggle behavior,
  - lineage legend toggle wiring,
  - auto-fit on sidebar layout changes,
  - legend strip style expectations.

---

## [0.2.0] - 2026-02-05

### Added

- **UX redesign**: Complete visual overhaul across query flow and workspace views (8-phase rewrite).
- **Theme token system**: New `src/shared/themeTokens.ts` — single source of truth for all theme colors, grid config, and accent colors.
- **SVG icon library**: `src/shared/icons.ts` with 18 SVG icons (16px) replacing emoji in UI elements.
- **Grid patterns**: Configurable canvas background — dots, lines, or none (`sqlCrack.gridStyle` setting).
- **Node accent strips**: Nodes use neutral fill + colored left accent strip instead of full-fill pastels (`sqlCrack.nodeAccentPosition` setting for left/bottom).
- **Bottom legend bar**: Frosted-glass legend strip at bottom of canvas with node type accent dots. Toggle with `L` key.
- **Export dropdown**: Consolidated export menu (PNG, SVG, Mermaid, Clipboard) replacing 4 separate toolbar buttons.
- **Layout picker**: Visual popover showing all 5 layouts with descriptions and keyboard shortcuts (1–5 keys), replacing blind `H` cycling.
- **Command bar**: `Ctrl+Shift+P` / `/` command palette with fuzzy-match filtering inside the webview.
- **Breadcrumb bar**: Filter/state indicator below toolbar showing active focus mode, search term, column trace, and CTE context.
- **First-run overlay**: Welcome overlay on first visualization open with feature callouts.
- **VS Code walkthrough**: 4-step onboarding walkthrough in `contributes.walkthroughs`.
- **Workspace navigation stack**: Back button with originating view name, per-view zoom/pan state preservation, crossfade transitions between views.
- **Accessibility**: `prefers-reduced-motion` support disabling all animations; `prefers-contrast: more` support with increased borders and high-contrast text colors; ARIA labels on interactive elements.
- **Renderer modularization**: Extracted `canvasSetup.ts`, `edgeRenderer.ts`, and barrel `index.ts` from renderer.ts into `src/webview/rendering/`.

### Changed

- **Dark theme background**: `#111111` (neutral) replacing `#0f172a` (blue-tinted) across all views.
- **Light theme background**: `#FAFAFA` replacing `#FFFFFF`.
- **Node design**: Neutral fill (`#FFFFFF` light / `#1A1A1A` dark) + 4px left accent strip (type-colored) for all node types including aggregate, window, case, CTE, and subquery nodes.
- **Edge colors**: `#CBD5E1` light / `#333333` dark default; `#6366F1` indigo on hover.
- **CTE/subquery clouds**: Theme-aware containers with neutral fill and accent-colored edges.
- **Toolbar**: Export dropdown and layout picker use `position: fixed` appended to `document.body` to escape `overflow: hidden` clipping.
- **Workspace views**: Unified theme with query flow — neutral-fill nodes, accent strips, theme-aware edges, updated sidebar/tooltip/search styles.
- **Keyboard shortcuts panel**: Fully theme-aware (light/dark) with updated colors and styling.
- **Stats/Hints panels**: Added subtle border and box-shadow for light theme visibility.
- **Column lineage panel**: Updated from blue-tinted to neutral theme colors for backgrounds, search input, column items, and hover states.

### Fixed

- **Export dropdown clipping**: Dropdown was hidden behind toolbar due to `overflow: hidden` — now appends to `document.body` with fixed positioning.
- **Layout picker clipping**: Same fix as export dropdown — uses body-appended fixed positioning.
- **Export dropdown theme switching**: Text color, separator backgrounds, and kbd badge colors now update on theme change.
- **Shortcuts panel always dark**: Fixed missed call site in toolbar help button that wasn't passing theme state.
- **Lineage path code elements**: Aggregate function expressions now have explicit styled backgrounds instead of inheriting dark webview defaults.
- **Cloud child node hover reset**: Aggregate/window/case nodes inside CTE/subquery clouds properly reset to neutral fill on mouseleave.

---

## [0.1.4] - 2026-02-04

### Added

- **Bottom-up flow direction**: New `sqlCrack.flowDirection` setting with `"top-down"` (default) and `"bottom-up"` options. Bottom-up mimics Snowflake query profile style where table scans start at the bottom and results flow upward. Applies to all dagre-based layouts (vertical, horizontal, compact) and Mermaid export.
- **Workspace Graph selection panel** with upstream/downstream context and quick actions.
- **Index freshness badge** showing when the workspace index was last built.
- **Empty-state overlay** for first open and no-match search results.
- **Search highlight** for matching graph nodes.
- **Lineage trace controls**: Trace Up/Down buttons for full upstream/downstream highlighting.
- **Impact Analysis grouping**: Transitive impacts grouped by parent table with collapsible UI.
- **Impact Analysis FK awareness**: Table-level foreign key constraints captured for dependency analysis.

### Changed

- **Impact Analysis paths**: Transitive impacts show `source → target` column paths using lineage edges.

### Changed

- **Regex escaping**: Consolidated inline regex escaping to use the shared `escapeRegex()` utility in `sqlParser.ts`, `lineNumbers.ts`, and `referenceExtractor.ts`.
- **Activation events**: Removed `onStartupFinished` to avoid unnecessary early activation when no SQL files are open.
- **Coverage thresholds**: Raised jest coverage thresholds to 60% (branches: 50%) as a regression guard.

### Fixed

- **Test failures (145 tests)**: Guarded `window.flowDirection` access in `sqlParser.ts` `layoutGraph` to fix `"window is not defined"` errors in Node.js test environment.
- **Graph shortcuts**: Keyboard shortcuts no longer interfere with search input.
- **Impact Analysis noise**: Exclude a table's own columns and only show columns with actual data flow.
- **Cross-file false positives**: Prevent transitive impacts from crossing unrelated schema files with shared table names.
- **Mermaid JOIN parse error**: Fixed invalid triple-brace `{{{...}}}` syntax for JOIN nodes causing Mermaid parse failures. JOIN nodes now use hexagon `{{...}}` shape; filter nodes use rhombus `{...}`.

### Improved

- **Debug logging**: Added parse timing logs (debug console) for SQL parsing duration, query count, and dialect.
- **Workspace logging**: Added index build start/completion/duration logs and error logging for file operation handlers.
- **Cache size warning**: User-facing notification when workspace index exceeds the 4MB cache limit, with guidance to narrow file scope.

## [0.1.3] - 2026-02-02

### Added

- **Keyboard navigation**: Arrow keys navigate between connected nodes; Tab cycles through nodes; focus trap keeps keyboard events in webview.
- **Panel animations**: Smooth slide-in/out transitions for Node Details and Optimization Hints panels.
- **Loading overlay**: Visual feedback when switching graph layouts (15+ nodes).
- **Pulse animation**: Nodes pulse when navigated to via search, zoom, or breadcrumb clicks.
- **Amber highlight for cloud sub-nodes**: Multi-pulse glow animation when navigating to tables inside CTE/subquery clouds.
- **Zoom persistence**: Zoom/pan state preserved when switching between query tabs.
- **"Clear filters" button**: Quick reset in hints panel when filters are active.
- **Shared `escapeRegex()` utility**: Centralized regex escaping in `src/shared/stringUtils.ts`.

### Changed

- **Zoom indicator**: Now displays percentage relative to "fit to view" (100% = fit view).
- **Zoom behavior**: Capped at 180% of fit-view scale to prevent excessive zooming; includes expanded cloud bounds in calculation.
- **Statement counting**: Improved accuracy for SQL without trailing semicolons.
- **Workspace index caching**: Added 4MB size limit guard and error handling for large workspaces.

### Fixed

- **CTE/subquery navigation**: Clicking a table in "Tables Used" now auto-expands the parent CTE cloud and highlights the table inside.
- **Broken edge on zoom**: Cloud containers now properly shown/hidden when zooming to expanded CTEs.
- **Regex injection (P2 security)**: Escaped special characters in dynamic regex patterns in `lineageBuilder.ts`, `schemaExtractor.ts`, and `renderer.ts`.
- **Script tag breakout (P2 security)**: All user-controlled strings in `visualizationPanel.ts` now use `_escapeForInlineScript()` to prevent `</script>` injection.
- **Lint warnings**: Expanded one-line if/else statements to multi-line with braces.

### Security

- **P2 #1-3**: Fixed regex metacharacter escaping in identifier lookups to prevent runtime errors with special characters in table/view names.
- **P2 #4**: Fixed potential script context breakout in webview HTML generation.

---

## [0.1.2] - 2026-01-31

### Added

- **Keyboard shortcut `L`**: Toggle legend panel visibility.
- **Keyboard shortcut `?`**: Show all keyboard shortcuts help dialog.
- **Testing infrastructure**: Jest setup with 414 tests covering parser, renderer, workspace, and lineage modules.

### Changed

- **Toolbar layout**: Responsive design with horizontal scroll on narrow screens instead of overlapping elements.
- **Error badge**: Adjusted positioning to align with new toolbar layout.

### Fixed

- **CTE CASE visualization**: Improved rendering of CASE expressions within CTEs.
- **Error messages**: More descriptive parse error messages with dialect suggestions.

---

## [0.1.1] - 2026-01-30

### Changed

- **README.md**: Fixed keyboard shortcut from `Cmd/Ctrl+Shift+V` to `Cmd/Ctrl+Shift+L` for visualization.
- **README.md**: Added `[` / `]` shortcuts for previous/next query navigation.
- **README.md**: Added Accessibility section with keyboard navigation documentation.
- **README.md**: Expanded Configuration into Core, Workspace, Custom Extensions, Custom Functions, and Advanced sections.
- **README.md**: Added Troubleshooting section with common issues and debug mode.
- **README.md**: Added Architecture Overview with directory structure and data flow.
- **README.md**: Updated roadmap with Phase 5 (polish & accessibility).
- **README.md**: Removed incorrect JSON/DOT export options (not implemented).
- **examples/README.md**: Added `analytics-customer.sql` and `analytics-orders.sql` to file reference.
- **examples/README.md**: Improved feature descriptions and added Pro Tips.

### Fixed

- Keyboard shortcut help: corrected "Previous query" arrow direction from `Q1 → Q2` to `Q2 → Q1`.

---

## [0.1.0] - 2026-01-29

### Added

- **Layout options**: Multiple layout algorithms with dropdown selector (e.g. vertical, horizontal, force-directed).
- **Zoom level indicator** in toolbar showing current zoom percentage.
- **Tooltips** on dialect selector and search input for better discoverability.
- **Keyboard shortcuts dialog** with improved two-column layout.
- **Setting** to combine consecutive DDL statements in visualization.
- **Examples quick reference guide** in `examples/README.md`.

### Changed

- **DDL visualization**: Improved CREATE statement labels with object names; reduced DDL description verbosity.
- **Cloud / CTE layout**: Fixed cloud arrow positioning for all directions; improved expand-all CTE layout with grid-based positioning.
- **Color theming**: Centralized colors in `constants/colors.ts`; panel styles, details panel HTML, SQL clause and legend templates now use theme constants (UI_COLORS, EDGE_COLORS, NODE_COLORS, etc.).
- **SQL validation**: Added validation before visualization — maximum SQL size (100KB) and maximum query count (50) to avoid performance issues or crashes on large/malformed input.

### Fixed

- Panel and template styles now respect dark/light theme via centralized constants.

---

## [0.0.9] - 2026-01-28

### Added

- **Arrow key navigation**: Pan only when the selected node is off-screen; center on node instead of zooming.
- **Keyboard behavior**: Single-click selects without navigating; Ctrl+Click navigates to SQL in editor. Escape key clears focus. Webview keeps focus when zooming/focusing nodes.
- **Focus mode**: Focus upstream/downstream dims nodes instead of hiding them; proper restore when exiting focus mode; ways to exit focused/zoomed view.
- **Search**: Search result count indicator; keyboard node navigation (e.g. next/previous result).
- **Context menu**: Right-click context menu with standardized terminology.
- **Setting**: `showDeadColumnHints` to show or hide dead-column warnings; expanded non-sargable condition detection.

### Changed

- **Node Details panel**: Reduced size for better space efficiency.
- **Code quality**: Addressed multiple code quality issues across the codebase.

### Fixed

- SQL navigation skipped for keyboard-based node selection; `requestAnimationFrame` used for resetView after clearing focus; SVG-specific Escape handler; keyboard events work after clicking on nodes.

---

## [0.0.8] - 2026-01-28

### Added

- **Keyboard shortcuts** for query navigation: `[` and `]` for previous/next query in multi-statement SQL.

### Fixed

- Arrow key navigation centers on node instead of zooming.
- Single-click vs Ctrl+Click selection and SQL navigation behavior.
- Webview focus when zooming/focusing nodes; Escape key handling; keyboard events after node click.
- Focus mode: dim instead of hide, restore on exit, exit controls.

---

## [0.0.7] - 2026-01-27

### Added

- **More SQL commands** supported (e.g. session/utility commands).
- **Configurable file extensions** for SQL file detection.

### Fixed

- **Theme-aware colors** for all UI panels.
- **Column lineage** bug (e.g. `[object Object]` display).
- Leading whitespace in SQL preview for session commands.
- Code quality and security-related issues.

---

## [0.0.6] - 2026-01-27

### Changed

- SQL file detection supports dialect variants and file extension fallback.
- Session/utility commands supported; SQL visualization allowed from any file.
- Consecutive session commands grouped into a single "Session Setup" block; leading comments stripped when detecting session commands.

### Fixed

- Merge and parser updates (node-sql-parser 5.4.0 related).

---

## [0.0.5] - 2026-01-27

### Added

- **Theme toggle**: Dark/light theme support for visualization and UI.
- **Search**: Graph icon, search in visualization, stats improvements.
- **Legend**: Collapsible legend for node types and colors.

### Changed

- Column Lineage panel size reduced for better efficiency.
- Impact analysis: removed redundant ternary expressions.

### Fixed

- Theme-aware colors for panels; column lineage display bug.

---

## [0.0.4] - 2026-01

### Added

- **Session/utility command support**: Commands like `SET`, `USE`, etc. grouped and visualized.
- **Visualize from any file**: No longer restricted to `.sql` only (with configurable extensions).
- **Session Setup block**: Consecutive session commands shown as one block.

### Fixed

- SQL file detection for dialect variants and file extension fallback.
- Parser and dependency updates (node-sql-parser 5.4.0).

---

## [0.0.3] - 2026-01

### Added

- **Demo video** in README and assets.
- **Extension icon** for marketplace and editor.
- **Visualize** option in explorer context menu for `.sql` files.
- **Marketplace metadata**: Publisher, repository URL, installation instructions in README.

### Changed

- `.vscodeignore` updated to exclude unnecessary files.
- Clean up of test files.

### Fixed

- node-sql-parser upgrade to 5.4.0; PNG export fixes.

---

## [0.0.2] - 2026-01

### Added

- **Workspace analysis**: Graph view, Lineage view, Table Explorer, Impact Analysis.
- **Lineage view**: Interactive graph, legend, mini-map, focus modes (upstream/downstream/all).
- **Dark/light theme** for workspace dependencies panel.
- **Export**: PNG, SVG, copy to clipboard; Mermaid export.
- **View location** toggle; pin visualization as separate editor tab.
- **Dialect selector**: MySQL, PostgreSQL, and other dialects via node-sql-parser.
- **Column lineage**: Click column to trace transformation path.

### Changed

- Refactor: Lightweight SVG-based visualization; SQLFlow-style hierarchical layout.
- Process polyfill for webview (`process is not defined` fix).

### Fixed

- ESLint warnings; SQL Flow export and tab switching; graph view context menu and edge highlight; lineage quick filter; line numbers for definitions.

---

## [0.0.1] - 2026-01

### Added

- Initial release.
- **SQL visualization**: Transform SQL into interactive flow diagrams.
- **Execution flow**: Color-coded operation nodes (Table, Filter, Join, Aggregate, Sort, Limit, CTE, Result).
- **Multi-query support**: Tab navigation for multiple statements.
- **CTE & subquery expansion**: Double-click to expand in floating panels.
- **Query statistics**: Complexity score, performance hints.
- **Workspace dependency graph**: Cross-file SQL analysis (Graph, Lineage, Tables, Impact views).

---

[0.3.8]: https://github.com/buva7687/sql-crack/compare/v0.3.7...v0.3.8
[0.3.7]: https://github.com/buva7687/sql-crack/compare/v0.3.6...v0.3.7
[0.3.6]: https://github.com/buva7687/sql-crack/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/buva7687/sql-crack/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/buva7687/sql-crack/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/buva7687/sql-crack/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/buva7687/sql-crack/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/buva7687/sql-crack/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/buva7687/sql-crack/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/buva7687/sql-crack/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/buva7687/sql-crack/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/buva7687/sql-crack/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/buva7687/sql-crack/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/buva7687/sql-crack/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/buva7687/sql-crack/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/buva7687/sql-crack/compare/v0.0.9...v0.1.0
[0.0.9]: https://github.com/buva7687/sql-crack/compare/v0.0.8...v0.0.9
[0.0.8]: https://github.com/buva7687/sql-crack/compare/v0.0.7...v0.0.8
[0.0.7]: https://github.com/buva7687/sql-crack/compare/v0.0.6...v0.0.7
[0.0.6]: https://github.com/buva7687/sql-crack/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/buva7687/sql-crack/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/buva7687/sql-crack/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/buva7687/sql-crack/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/buva7687/sql-crack/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/buva7687/sql-crack/releases/tag/v0.0.1
