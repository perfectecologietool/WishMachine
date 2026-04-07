# Implementation Plan: Codebase-to-Knowledge-Graph Reverse Compiler

This document outlines the strategy for building a directed traversal engine capable of reverse-compiling a software codebase into a structured knowledge graph, layering Phase 0 (Filesystem) up to Phase 4 (Global Dependency Graph).

## 1. Goal Description

The objective is to ingest an existing software codebase and dynamically decompose it into a navigable, recursive JSON knowledge graph using LLMs. This effectively treats software as a DAG (Directed Acyclic Graph) of components and logic.

Instead of a bulk analysis, the system will employ a **Wave-Front execution model**, permitting targeted, token-efficient traversal (e.g., Application -> File -> Function -> Algorithmic Steps) using 5 distinct prompted phases.

## 2. Architecture & The 5-Phase Pipeline

We will construct a new service module (e.g., `services/codeDecomposer.js` and matching backend endpoints like `api/traverse_repo.php`) to act as the extraction engine. 

### Phase 0: Filesystem Graph Extraction
*   **Action**: A PHP script hosted on the webserver traverses a dedicated upload folder. The user will upload their text-only, uncompiled source files to this folder via FTP (or a web upload tool). The PHP script safely scans the directory to map the structure.
*   **Output**: A clean JSON tree of directories and standard source files.
*   **UI Integration**: Displays as a file-tree where each node can be "expanded" to trigger Phase 1.

### Phase 1: File-Level Semantic Extraction
*   **Action**: When a file node is expanded, read the source code from the server and send it to the LLM with **Prompt 1 (File Decomposer)**.
*   **Output**: JSON array of Imports, Exports, Classes, Functions, and Globals.
*   **UI Integration**: Renders inside the file node, giving the user UI buttons to "analyze" specific functions or classes.

### Phase 2: Code Object Semantic Mapping
*   **Action**: Triggered when a specific Function or Class node is selected. Extracts the component's code block and uses **Prompt 2 (Component Analyzer)**.
*   **Output**: JSON detailing Purpose, I/O, Dependencies, and State variables.
*   **Graph Linking**: Edges are drawn to the imports or other internal components the function relies upon.

### Phase 3: Algorithm Decomposition
*   **Action**: Triggered on complex functions. Uses **Prompt 3 (Algorithm Extractor)** to unpack the internal logic step-by-step.
*   **Output**: An array of atomic, causal algorithmic steps and edge cases.

### Phase 4: Global Dependency Graph Building
*   **Action**: Periodically coalesces all extracted Phase 0-3 JSON fragments into an aggregate `nodes` and `edges` format.
*   **Output**: The definitive map of the parsed subsystem (Prompt 4 integration/reduction).

## 3. UI and Execution Strategy (The Wave-Front)

Instead of dumping an entire repository to the LLM at once, we provide a **directed traversal UI**:

1.  **Upload & Select**: User uploads code via FTP. The UI triggers the PHP traversal script.
2.  **Phase 0 Auto-runs**: Visualizes the tree.
3.  **Manual Expansion**: The user clicks `+ Analyze` next to a file. The LLM processes Phase 1. Over time, the graph populates exactly what the user is interested in.
4.  **Token Efficiency**: Only targeted parts of the codebase are converted into detailed algorithm steps.

## 4. User Review Required

> [!IMPORTANT]
> **Data Persistence Location**: Where should the resulting Knowledge Graph be stored?
> - Option A: Add a new MySQL table (e.g., `knowledge_graph_nodes` & `knowledge_graph_edges`) alongside your newly migrated Ollama cache.
> - Option B: Save it locally as a JSON blob (e.g., `graph_state.json`) for now while prototyping.

> [!WARNING]
> **FTP Setup**: Does the FTP server already exist with a defined directory (e.g. `uploads/source/`), or should I provision a barebones folder in WDL_2026March23 for now to simulate the user FTP drop?

## 5. Next Steps / Open Questions

Please review the adjusted Phase 0 action. If you're happy with this direction, please address the **Data Persistence Location** question and let me know if I should create the PHP endpoint and a dummy upload folder to start our Phase 0 prototyping!
