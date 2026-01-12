# SQL Crack - Feature Roadmap & TODO List

## ✅ Currently Implemented Features

- [x] Node-based DAG visualization (tables, CTEs, joins, filters, aggregates, etc.)
- [x] Multi-dialect support (MySQL, PostgreSQL, Snowflake, BigQuery, Redshift, Hive, Athena, Trino, etc.)
- [x] CTE and subquery visualization
- [x] Window functions and CASE statements
- [x] Multi-statement/batch query support
- [x] Query statistics and complexity scoring
- [x] Basic optimization hints (SELECT *, missing LIMIT, cartesian products)
- [x] Column lineage extraction (backend)
- [x] Editor-to-flow synchronization
- [x] Pin/save visualizations
- [x] Query tab auto-switching based on cursor
- [x] Interactive details panel
- [x] Light/dark theme support
- [x] SVG-based rendering
- [x] Basic hover tooltips
- [x] Search functionality

---

## Phase 1: Core Professional Features (High Priority)

### 1.1 Enhanced Interactive Navigation ⭐⭐⭐
**Priority: CRITICAL**

- [ ] **Click node → Jump to SQL definition**
  - Status: Line numbers assigned but navigation incomplete
  - Action: Implement `goToLine` message handling with proper selection

- [ ] **Click edge → Highlight relevant SQL clauses**
  - Highlight JOIN conditions
  - Highlight WHERE clauses
  - Highlight column references

- [ ] **Breadcrumb navigation for nested CTEs**
  - CTE hierarchy path
  - Click to navigate between CTE levels

- [ ] **Enhanced hover tooltips**
  - Show actual SQL fragment
  - Row count estimates (if available)
  - Filter condition details

### 1.2 Column-Level Lineage Visualization ⭐⭐⭐
**Priority: CRITICAL - HIGH VALUE DIFFERENTIATOR**

- [ ] **Visual column-to-column mapping**
  - Column flow lines between nodes
  - Color-coded by transformation type:
    - Direct passthrough (green)
    - Renamed (blue)
    - Aggregated (orange)
    - Calculated/derived (purple)

- [ ] **Column details panel**
  - "Where does this column come from?"
  - Upstream source tables and columns
  - Transformation chain visualization

- [ ] **Highlight column usage**
  - Click column → highlight all references
  - Show: filters, joins, aggregations using that column

- [ ] **Derived column tracking**
  - CASE statements
  - Functions (CONCAT, CAST, etc.)
  - Expressions (mathematical, string operations)

### 1.3 Read vs Write Differentiation ⭐⭐
**Priority: HIGH**

- [ ] **Visual distinction for node types**
  - Source tables (read-only): Blue border with "READ" badge
  - Target tables (write): Red border with "WRITE" badge
  - Derived/temp tables: Purple border with "DERIVED" badge

- [ ] **Operation type indicators**
  - INSERT operations
  - UPDATE operations
  - DELETE operations
  - MERGE operations
  - CREATE TABLE AS SELECT (CTAS)

### 1.4 CTE Expansion Controls ⭐⭐
**Priority: HIGH**

- [ ] **Collapsible CTE nodes**
  - Currently exists in code but may not work properly
  - Verify and fix collapse/expand functionality

- [ ] **CTE preview on hover**
  - Show first few columns
  - Show row count if available

- [ ] **Nested CTE visualization**
  - Show CTE dependency chain
  - Hierarchical layout for nested CTEs

---

## Phase 2: Developer Productivity & Quality (Medium-High Priority)

### 2.1 Advanced SQL Annotations ⭐⭐
**Priority: HIGH**

- [ ] **Comprehensive hover warnings**
  - ✅ SELECT * (exists)
  - ✅ Cartesian joins (exists)
  - [ ] Unused CTEs
  - [ ] Dead columns (never used downstream)
  - [ ] Duplicate subqueries
  - [ ] Missing indexes hints (if schema available)

- [ ] **Visual indicators on nodes**
  - Expensive joins (badge: ⚠️)
  - Fan-out risks (badge: 📊)
  - Repeated table scans (badge: 🔄)
  - Complex expressions (badge: 🧮)

### 2.2 Query Complexity Insights ⭐⭐
**Priority: MEDIUM-HIGH**

- [ ] **Enhanced metrics panel**
  - ✅ Number of joins (exists)
  - ✅ CTE count (exists)
  - [ ] Maximum depth of CTE chain
  - [ ] Maximum fan-out factor
  - [ ] Estimated complexity score with breakdown

- [ ] **Visual complexity indicators**
  - Color-code nodes by complexity
  - Highlight "hot paths" (critical execution paths)
  - Show bottleneck nodes

### 2.3 Diff-Aware Visualization ⭐⭐⭐
**Priority: HIGH - STRONG DIFFERENTIATOR**

- [ ] **SQL comparison mode**
  - Load two versions of SQL
  - Side-by-side comparison

- [ ] **Visual diff indicators**
  - Added nodes (green outline)
  - Removed nodes (red outline with strikethrough)
  - Modified nodes (orange outline)
  - Changed columns (highlight in yellow)

- [ ] **Change summary panel**
  - List of all changes
  - Impact analysis ("X downstream nodes affected")

- [ ] **Integration points**
  - Git diff view
  - PR review mode
  - Before/after refactor comparison

---

## Phase 3: Performance & Optimization (Medium Priority)

### 3.1 Performance Signals ⭐
**Priority: MEDIUM**

- [ ] **Heuristic optimization hints**
  - Filters applied late (should be early)
  - Join before filter (inefficient pattern)
  - Repeated scans of same table
  - Cross join warnings

- [ ] **Visual optimization indicators**
  - Show filter pushdown opportunities
  - Highlight join order issues
  - Mark potentially expensive operations

- [ ] **"Optimization opportunities" panel**
  - List of actionable suggestions
  - Before/after SQL snippets
  - Estimated impact

### 3.2 Query Plan Integration (Future) ⭐
**Priority: LOW (Advanced)**

- [ ] **Overlay actual execution plan**
  - If EXPLAIN available
  - Show actual vs estimated rows
  - Highlight performance bottlenecks

- [ ] **Cost-based coloring**
  - Color nodes by actual execution cost
  - Show expensive operations in red

---

## Phase 4: Workspace & Cross-File Awareness (Medium Priority)

### 4.1 Cross-File Lineage ⭐⭐
**Priority: MEDIUM-HIGH**

- [ ] **Multi-file resolution**
  - Parse CREATE VIEW statements
  - Resolve table/view references across files
  - Build workspace-wide dependency graph

- [ ] **"Find all usages"**
  - Right-click table → "Find usages"
  - Show all queries referencing this table

- [ ] **Impact analysis**
  - "What depends on this table?"
  - "What will break if I change this?"

- [ ] **Workspace dependency graph**
  - Overview of all SQL files
  - Show interdependencies
  - Detect circular dependencies

### 4.2 dbt Integration ⭐⭐⭐
**Priority: HIGH (if targeting dbt users)**

- [ ] **Parse dbt-specific syntax**
  - `{{ ref('model_name') }}`
  - `{{ source('source_name', 'table_name') }}`
  - `{{ var('variable_name') }}`

- [ ] **Visualize dbt model DAG**
  - Show model dependencies
  - Distinguish between:
    - Sources
    - Staging models
    - Intermediate models
    - Marts

- [ ] **Show dbt metadata**
  - Materialization type (table, view, incremental, ephemeral)
  - Tests (unique, not_null, relationships, etc.)
  - Documentation strings

- [ ] **dbt project navigation**
  - Browse models by folder
  - Jump to model definition
  - Show upstream/downstream models

---

## Phase 5: UX & Visualization Enhancements (Low-Medium Priority)

### 5.1 Advanced Layout Controls ⭐
**Priority: MEDIUM**

- [ ] **Layout algorithms**
  - ✅ Top-down (exists via dagre)
  - [ ] Left-to-right
  - [ ] Radial layout
  - [ ] Force-directed layout

- [ ] **Manual node repositioning**
  - Drag-and-drop nodes
  - Save custom layouts
  - Reset to auto-layout

- [ ] **Mini-map**
  - Verify existing implementation works
  - Add zoom indicators
  - Click to navigate

### 5.2 Filtering & Focus Modes ⭐⭐
**Priority: MEDIUM**

- [ ] **Filter controls**
  - Show only: CTEs
  - Show only: Base tables
  - Show only: Final outputs
  - Show only: Joins

- [ ] **Trace modes**
  - "Trace upstream" - show all sources for selected node
  - "Trace downstream" - show all dependents
  - "Path between nodes" - highlight path between two nodes

- [ ] **Isolation mode**
  - Focus on single subquery/CTE
  - Fade out unrelated nodes

### 5.3 Enhanced Export ⭐
**Priority: LOW-MEDIUM**

- [ ] **Export formats**
  - [ ] SVG (may exist)
  - [ ] PNG (may exist)
  - [ ] PDF
  - [ ] Mermaid diagram
  - [ ] Markdown with embedded diagram

- [ ] **Export options**
  - Include/exclude details panel
  - Include/exclude stats
  - Custom resolution
  - Transparent background

---

## Phase 6: Enterprise & Extensibility (Low Priority)

### 6.1 Security & Privacy ⭐
**Priority: MEDIUM (Enterprise)**

- [ ] **Local-only parsing**
  - ✅ Already done (no external calls)
  - [ ] Add clear messaging

- [ ] **Sensitive data handling**
  - Redact table names option
  - Redact column names option
  - Export without sensitive info

### 6.2 Plugin System ⭐
**Priority: LOW (Advanced)**

- [ ] **Custom dialect support**
  - API for adding new SQL dialects
  - Custom parsing rules

- [ ] **Custom rules engine**
  - User-defined linting rules
  - Custom optimization hints

- [ ] **Metadata enrichment**
  - Connect to data catalogs
  - Show table owners
  - Show row counts
  - Show update timestamps

### 6.3 Integration Capabilities ⭐
**Priority: LOW**

- [ ] **Git integration**
  - Git blame overlay
  - Show commit history for query
  - Link to PRs

- [ ] **Data catalog integration**
  - Fetch table descriptions
  - Show column descriptions
  - Link to documentation

- [ ] **BI tool integration**
  - Export to Tableau
  - Export to Looker
  - Export to Power BI

---

## Phase 7: AI & Advanced Features (Future/Nice-to-Have)

### 7.1 AI-Assisted Features ⭐
**Priority: LOW (Experimental)**

- [ ] **Natural language explanations**
  - "Explain this query in plain English"
  - Summarize transformations

- [ ] **Query optimization suggestions**
  - AI-powered refactoring hints
  - Alternative query patterns

- [ ] **Automatic documentation**
  - Generate docs from query structure
  - Suggest meaningful names for CTEs

### 7.2 Collaboration Features ⭐
**Priority: LOW**

- [ ] **Share visualizations**
  - Generate shareable links
  - Embed in documentation

- [ ] **Comments & annotations**
  - Add notes to nodes
  - Team discussions on query logic

---

## Summary: Missing Features by Priority

### 🔴 CRITICAL (Phase 1)
1. **Column-level lineage visualization** - Biggest differentiator
2. **Click node → Jump to SQL definition** - Core navigation
3. **Click edge → Highlight SQL clauses** - Essential interactivity
4. **Read vs Write differentiation** - Critical for data engineers

### 🟠 HIGH (Phase 1-2)
5. **Diff-aware visualization** - Strong differentiator for PR reviews
6. **CTE collapse/expand** - Essential for readability
7. **Enhanced hover warnings** - Developer productivity
8. **Breadcrumb navigation** - Nested query navigation
9. **dbt integration** (if targeting dbt users) - Market fit

### 🟡 MEDIUM (Phase 2-4)
10. **Advanced optimization hints** - Performance insights
11. **Cross-file lineage** - System-level awareness
12. **Query complexity insights** - Code review value
13. **Filter & focus modes** - UX improvement
14. **Manual node repositioning** - Power user feature

### 🟢 LOW (Phase 5-7)
15. **Execution plan overlay** - Advanced performance
16. **Plugin system** - Extensibility
17. **AI features** - Experimental
18. **Collaboration features** - Team workflow

---

## Recommended Implementation Order

**Quarter 1 (Months 1-3): Core Professional Features**
- Week 1-2: Click node → Jump to SQL + Click edge → Highlight
- Week 3-4: Column-level lineage visualization (basic)
- Week 5-6: Read vs Write differentiation
- Week 7-8: CTE expansion controls
- Week 9-10: Enhanced hover tooltips
- Week 11-12: Breadcrumb navigation

**Quarter 2 (Months 4-6): Developer Productivity**
- Week 1-4: Diff-aware visualization
- Week 5-6: Advanced SQL annotations
- Week 7-8: Query complexity insights
- Week 9-10: Performance signals
- Week 11-12: Polish & bug fixes

**Quarter 3 (Months 7-9): Workspace Awareness**
- Week 1-4: Cross-file lineage
- Week 5-8: dbt integration (if applicable)
- Week 9-12: Workspace dependency graph

**Quarter 4 (Months 10-12): Advanced Features & Polish**
- Advanced layout controls
- Export enhancements
- Enterprise features
- Performance optimization
- Documentation & onboarding

---

## Metrics for Success

- **Adoption**: Daily active users, retention rate
- **Engagement**: Queries visualized per user, time spent in tool
- **Value**: GitHub stars, user testimonials, enterprise inquiries
- **Quality**: Bug reports, feature requests, NPS score

---

*Last updated: 2026-01-12*
*Current version: 0.0.1 (dev branch)*
