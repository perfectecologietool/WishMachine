# Knowledge Artifact: Temporal Nexus (v14.3 OOP Edition)

## Summary
Temporal Nexus is a complex, browser-based, single-page application designed for advanced goal planning, dependency tracking, and execution logging. Evolving into an Object-Oriented paradigm (v14.3), it manages multiple interconnected graphs (Architect, Historian, Engine, Blueprint/Tasks, and Innovation) through a unified data model. The application allows users to construct hierarchical project dependencies, log chronological commits, build layered sub-tasks, and conduct branching scientific experiments—all synchronized across distinct interactive visual canvases using the `vis-network` library.

---

## Technical Logic

The application relies on a unified OOP data model to prevent state desynchronization and infinite recursion across the various visual graphs.

### Core Domain Objects
The architecture is built on a hierarchy of classes, all inheriting from a base `NexusNode`.

1.  **`NexusNode` (Base Class):** 
    * Provides fundamental identity (`id`, `label`, `data`, `created` timestamp).
    * Defines a base `updateDock()` method for UI synchronization.

2.  **`ArchNode` (The Project/Goal):** 
    * The core structural unit representing a major milestone or project.
    * **Graph Linking:** Maintains explicit bidirectional arrays: `dependents` (parent nodes that rely on this node) and `dependencies` (child nodes required by this node).
    * **Sub-Graph Ownership:** Encapsulates its own history, tasks, and experiments:
        * `histRoot`: A single `HistNode` representing the project's genesis in the Historian view.
        * `taskGraph`: An array of `TaskNode` objects representing the internal Blueprint.
        * `innRoots`: An array of `InnNode` objects representing the starting points for experimental branches.

3.  **`HistNode` & `CommitNode` (The Log):**
    * `HistNode` acts as the anchor for a project's timeline.
    * It contains an array of `CommitNode` objects, forming a chronological, single-linked sequence of updates or logs (the "commits").

4.  **`TaskNode` (The Blueprint):**
    * Represents a granular task required to complete an `ArchNode`.
    * Assigned a specific architectural `layer` (1: Domain, 2: Application, 3: Adapter, 4: External).
    * Maintains an adjacency list (`edges`) linking to other task IDs, allowing for complex internal workflows.

5.  **`InnNode` (The Innovation Lab):**
    * Represents a scientific experiment (Observation, Hypothesis, Test).
    * Structured as a binary tree: 
        * `next`: Pointer to the next iteration if the hypothesis is validated.
        * `pivot`: Pointer to an alternative iteration if the hypothesis is falsified.
    * Includes an `expiryDate` for time-sensitive experiments and tracks `timeConsumed` via the integrated timer.

### System Manager (`NexusSystem`)
A Singleton controller that bridges the OOP domain with the `vis-network` UI.

* **Source of Truth:** Maintains a `nodes` Map containing all root `ArchNode` instances, and a global `registry` Map for O(1) lookup of *any* node (Arch, Hist, Task, Inn).
* **The Render Loop:** The core mechanism for avoiding infinite loops (specifically the "Race Track" cycle bug). The `render()` method reads the pure OOP structure and dynamically translates it into flat `vis.DataSet` arrays for the visual canvases.
* **Engine Room (Concurrent Racetrack):** Dynamically calculates a topological layout based on the `dependencies` array. It visualizes bottlenecks by reading the `isFinished` status of dependencies, coloring blocked nodes red and active nodes green.
* **State Persistence:** Handles serialization by extracting graph relationships into ID arrays (to avoid circular JSON errors) and deserialization by rebuilding the OOP objects and explicitly re-linking the physical object references.

---

## Project Conventions

To ensure stability and maintainability, the following conventions are strictly enforced:

### 1. The Dependency Paradigm
* **Rule:** "The older object points to the newer object, for which the older object depends on the newer object."
* **Visual Logic:** Edge arrows point from the Dependent (Parent) to the Dependency (Child). If Project A requires Project B to be completed first, the arrow points A $\to$ B.

### 2. Rendering & State Updates
* **Unidirectional Flow:** User interactions (clicks, modals) do *not* directly manipulate the `vis-network` data sets. Instead, they update the OOP instances in the `NexusSystem`.
* **Trigger $\to$ Update $\to$ Render:** Every state change must conclude by calling `this.saveState()` followed by `this.render()`, which safely reconstructs the visual datasets from the ground up.

### 3. Modals and User Interface
* **Action Dock Dependency:** All user actions (Edit, Commit, Delete, Timer) are centralized in the bottom Action Dock, which dynamically enables/disables based on the `currentSelection`.
* **Modal Singularity:** The application uses persistent HTML modal overlays rather than browser `prompt()` or `alert()` boxes for complex data entry (Architect configuration, RollerDeck hypothesis testing, Task creation).

### 4. Cross-Graph Synchronization
* Because `ArchNodes` own their sub-graphs, deleting an `ArchNode` mandates a recursive purge. The `delete` action must iterate through the `histRoot`, `innRoots`, and `taskGraph` to remove all child entities from the global `registry` to prevent memory leaks and "ghost" nodes.
* Selecting a node in one canvas (e.g., Engine) automatically highlights and focuses the camera on the corresponding representation in the other canvases (e.g., Architect).

---

## User Interface (UI) Architecture

The Temporal Nexus UI is designed to minimize context switching, presenting distinct operational "dimensions" simultaneously across synchronized visual canvases.

### 1. The Global Header
* **Global Controls:** Provides immediate access to state management, including JSON Import/Export, flat-text report generation, layout restabilization (Tree view), and an emergency wipe.
* **Search:** A rapid-filter input to locate and auto-focus specific nodes across all visual canvases.

### 2. The Multi-Canvas Workspace
The central workspace is divided into distinct panels, each rendering a specific facet of the underlying OOP data model. Selecting a node in one canvas synchronizes the focus across all others.

* **The Historian (Left Panel):** Visualizes the chronological audit trail. It uses a custom bilinear layout: root project nodes stretch horizontally (representing time of creation), while `HistNodes` (commits) drop vertically beneath their respective projects (representing sequential updates).
* **The Architect (Top Right Panel):** The macro-level view mapping `ArchNodes`. It visualizes structural dependencies using a hierarchical top-down layout, illustrating which milestones act as prerequisites for others.
* **The Engine Room (Bottom Right Panel - Tabbed):**
    * **Racetrack (Engine):** A concurrent, left-to-right topological layout of `ArchNodes` that visualizes workflow bottlenecks using strict color-coding (Red = Blocked, Cyan = Active, Gold = Complete).
    * **Blueprint (Tasks):** A force-directed sub-graph of `TaskNodes` assigned to the currently selected `ArchNode`.
    * **Innovation Lab:** A hierarchical sub-graph of `InnNodes` (experiments) linked to the current context, enabling visual branching of hypotheses and iterations.

### 3. The Action Dock
A persistent, context-aware command bar anchored to the bottom of the screen.
* **Dynamic State:** Buttons (Edit, Commit, Add Dependency/Derivative, Delete, Status Toggles) activate or deactivate based on canvas selection.
* **Integrated Work Timer:** A specialized chronometer that tracks active work sessions. It binds to the selected `InnNode` and rolls up time consumption to the parent `TaskNode` and `ArchNode`.

### 4. Overlays & Modals
Data entry is handled via CSS-driven overlays to maintain user flow without page reloads.
* **Architect Modal:** Captures project metadata (Catalyst/Vector) and manages explicit lineage (dependencies).
* **RollerDeck (Innovation Modal):** A specialized interface designed around the scientific method, capturing Observation, Question, Hypothesis, Null Hypothesis, Test, and Results.

---

## User Experience (UX): The Execution Trail

The true power of Temporal Nexus lies in its specific, top-down-to-bottom-up workflow. The following traces the "Golden Path" of a user interacting with the system from conceptualization to completion.

### Phase 1: Defining the Macro Structure (The Architect)
1. **Genesis:** The user begins by double-clicking the empty void of the Architect canvas. The Architect Modal appears, prompting the creation of an `ArchNode` representing a major milestone.
2. **Dependency Mapping:** Selecting the newly created node, the user clicks "+ CHILD" or "+ PARENT" in the Action Dock. This creates connecting nodes, establishing a directed acyclic graph where older nodes point to newer nodes they depend on. 
3. **Result:** The user establishes a structural roadmap, outlining exactly what needs to be built and in what order.

### Phase 2: Drafting the Micro Steps (The Blueprint)
1. **Drill Down:** The user clicks a specific `ArchNode` in the Architect canvas. The Engine Room updates to reflect this selection.
2. **Task Creation:** Switching to the "Blueprint" tab, the user double-clicks to populate the `ArchNode` with `TaskNodes`. These tasks represent the granular, actionable steps required to fulfill the parent milestone (e.g., UI Design, Database Schema).

### Phase 3: Scientific Execution (The Innovation Lab)
1. **Hypothesis Generation:** With a specific task highlighted, the user switches to the "Innovation" tab and double-clicks to open the **RollerDeck**.
2. **Experimentation:** The user defines an `InnNode`, answering the prompts: *What is the observation? What is the hypothesis? How will it be tested?* 
3. **Deep Work:** The user selects the active `InnNode` and clicks the **Timer** in the Action Dock. Deep work commences. Time consumed is actively tracked and rolled up the OOP hierarchy.
4. **Iteration:** Upon finishing the work session, the user logs the results in the RollerDeck. If the hypothesis failed, the user clicks "Iterate" to branch a new `InnNode` off the original, maintaining the observation but pivoting the approach.

### Phase 4: Chronological Auditing (The Historian)
1. **Logging Wins:** Throughout the execution of tasks and experiments, the user clicks "COMMIT" in the Action Dock.
2. **Traceability:** The user links the commit to the active Innovation experiment and logs build notes or how-tos. This drops a new node into the Historian canvas, creating an immutable, searchable history of *how* the project evolved.

### Phase 5: Crossing the Finish Line (The Racetrack)
1. **Status Check:** At the end of a sprint, the user switches the bottom tab to the "Racetrack" (Engine view).
2. **Visual Feedback:** The user observes the graph. Red nodes indicate blocked progress due to unfinished dependencies. 
3. **Completion:** Having completed all Blueprint tasks and Innovation experiments for an active (Cyan) `ArchNode`, the user highlights it and clicks **"DONE"** in the Action Dock.
4. **Unlocking the Flow:** The node turns Gold. The system recalculates the graph. Subsequent dependent nodes that were previously blocked (Red) dynamically update to Active (Cyan), signaling to the user exactly what macro-milestone to tackle next.
