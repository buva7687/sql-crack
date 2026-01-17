# SQL Flow Visualization VS Code Extension - Feature Specification

## Overview
This document outlines the feature requirements for a professional-grade, open-source SQL flow visualization extension for Visual Studio Code. The goal is to bridge the gap between raw SQL text and mental models of data flow, aiding in debugging, documentation, and onboarding.

---

## 1. The Core Engine (Static Analysis)
This is the foundation of the extension. To ensure reliability and professional usage, the engine must move beyond simple Regex parsing.

*   **AST-Based Parsing**
    *   Utilize robust Abstract Syntax Tree (AST) generation to distinguish between tables, columns, aliases, and sub-queries.
    *   **Libraries:** `node-sql-parser` or `tree-sitter`.
*   **Multi-Dialect Support**
    *   Professionals work across various database technologies.
    *   **Target Dialects:** Standard SQL, PostgreSQL, MySQL/MariaDB, MS SQL Server (T-SQL), Snowflake, BigQuery.
*   **CTE (Common Table Expression) Handling**
    *   Must correctly parse `WITH` clauses.
    *   Visualize the temporary scope of CTEs and their flow into the main query or subsequent CTEs.
*   **Sub-query Expansion**
    *   Support for "Zooming" into sub-queries.
    *   Option to flatten complex sub-queries to view the full logic without nesting obfuscation.

## 2. Visualization & UI/UX
The visualization must be readable, navigable, and aesthetically pleasing to reduce cognitive load.

*   **Intelligent Layout Algorithms**
    *   **Hierarchical (Left-to-Right):** Best for understanding transformation pipelines.
    *   **Force-Directed:** Useful for exploring highly interconnected schemas.
    *   **User Control:** Allow toggling between layouts.
*   **Column-Level Lineage (The "Killer Feature")**
    *   Do not just show Table A connecting to Table B.
    *   Show specifically how `Table A.col_x` + `Table B.col_y` maps to the final output. Crucial for debugging data integrity.
*   **Clustering and Folding**
    *   For massive queries, allow users to group nodes into "Clusters" or "Sub-graphs" to de-clutter the canvas.
*   **Minimap Navigation**
    *   Essential for navigating large queries (500+ lines) efficiently.
*   **Semantic Color Coding**
    *   **Green:** Source Tables.
    *   **Blue:** Intermediate/CTE Nodes.
    *   **Orange:** Final Output/Target.
    *   **Red:** Deleted/Dropped entities.

## 3. Editor Integration (VS Code Specifics)
The extension should feel native to the VS Code environment, leveraging the editor's capabilities.

*   **Bi-Directional Navigation**
    *   **Code-to-Graph:** Highlighting a table name in the text editor highlights the corresponding node in the graph.
    *   **Graph-to-Code:** Clicking a node in the graph moves the cursor to the exact line in the SQL file.
*   **Hover Inspections**
    *   Hovering over a node in the graph displays a tooltip with:
        *   Data types (if metadata is available).
        *   Contextual usage in the script.
*   **Live Updates**
    *   The graph should react to code changes in real-time.
    *   **Performance:** Implement debouncing (e.g., update after 500ms of inactivity) to prevent UI lag.
*   **Webview Implementation**
    *   Utilize the VS Code Webview API to render the interactive graph using modern web technologies.

## 4. Advanced "Pro" Features
These features distinguish a utility tool from a production-grade asset.

*   **Execution Plan Visualization**
    *   Integrate with `EXPLAIN ANALYZE` (if a database connection is provided).
    *   Overlay performance metrics (cost, time, row count) directly onto the visual nodes to identify bottlenecks.
*   **File Cross-Referencing**
    *   SQL projects often span multiple files (e.g., `schema.sql`, `views.sql`).
    *   Parse the entire workspace to visualize dependencies across file boundaries.
*   **Export to Documentation**
    *   One-click export to **SVG** or **PNG** (for presentations).
    *   Export to **Mermaid.js** or **PlantUML** (for Markdown documentation/Wikis).
*   **Focus Mode**
    *   "Upstream Focus": Show only the data sources contributing to the selected node.
    *   "Downstream Focus": Show only what happens to the data *after* the selected node.

## 5. Open Source & Architecture Strategy
To ensure sustainability and community contribution, the project must be modular and transparent.

*   **Modular Architecture**
    *   **Parser Layer:** Handles language-specific syntax.
    *   **Graph Builder Layer:** Converts AST into graph data structures.
    *   **Renderer Layer:** Handles the UI visualization.
    *   *Benefit:* Community members can add support for a new SQL dialect without needing to understand the UI code.
*   **Configuration Settings**
    *   Allow users to customize:
        *   Max nodes before auto-clustering.
        *   Theme colors.
        *   Schemas to ignore (e.g., `temp`, `information_schema`).
*   **Privacy & Telemetry**
    *   **Core Principle:** All processing must be local. No user SQL code should ever be sent to external servers.
*   **Testing Infrastructure**
    *   SQL parsing is prone to edge cases.
    *   Provide a comprehensive test suite with "spaghetti SQL" examples to ensure stability.

## 6. Recommended Tech Stack

| Component | Technology Recommendation |
| :--- | :--- |
| **Language** | TypeScript |
| **Parsing** | `node-sql-parser` (ease of use) or `tree-sitter` (performance) |
| **Visualization** | `Cytoscape.js` (Graph theory logic) or `React Flow` (Modern UI) |
| **Build Tool** | `esbuild` or `webpack` |

## 7. MVP Roadmap

1.  **V0.1 (The Prototype):**
    *   Parse a single `SELECT` statement with joins.
    *   Visualize Table-to-Table connections.
    *   Basic Webview rendering.

2.  **V0.5 (The Usable Tool):**
    *   Support CTEs and Sub-queries.
    *   Implement Click-to-Definition (Graph-to-Code navigation).

3.  **V1.0 (The Stable Release):**
    *   Multi-dialect support (Postgres/MySQL).
    *   Column-Level Lineage visualization.
    *   Export to PNG/SVG.

4.  **V1.5 (The Professional Suite):**
    *   Workspace-wide scanning (Inter-file dependencies).
    *   Execution plan overlays.