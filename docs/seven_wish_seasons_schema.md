# Knowledge Artifact: The Four Seasons Schema of Seven_Wish

The `Seven_Wish` architecture's lifecycle—its journey from a user's initial idea to a completed execution—is governed by the `runFullPipeline()` orchestrator. This highly recursive and component-driven pipeline is effectively conceptualized using a **"Four Seasons Schema"**. 

This schema acts as an architectural metaphor that segments the pipeline into independent, distinct phases of creation, analysis, planning, and execution. By formalizing these seasons, it is much easier to manage context isolation, API prompt strategies, UI/UX indicators, and data lifecycles.

---

## 🍂 Autumn: The Detonation (Pre-Pipeline & Initialization)
> *"Freeing the fruit from the tree. Exploding the wish."*

Autumn is the starting point of the `Seven_Wish`. It marks the transition from human intent to system processing.

* **Trigger Actions:** `handleNewDecompositionSweep()`
* **Mechanism:** 
  The user enters a massive "Great Wish" (the `topic_name` macro goal). In this season, the monolithic requirement is detached from the user and introduced to the pipeline engine.
* **State Operations:** 
  - A blank `Seven_Wish` framework is instantiated.
  - The single overarching concept is placed into a solitary `Four_Component` seed knot at the root of the Decomposition structure.
* **Architectural Purpose:** To initiate the explosion from a singular node.

---

## ❄️ Winter: Decomposition (Recursive Analysis)
> *"The roots go deep in the dark. Formulating the Knowledge graph."*

Winter is the deep, iterative analytical phase. It relies heavily on recursive unpacking to strip the user's initial idea down to its barest architectural foundations.

* **Trigger Actions:** `executeNextWave()` & `WDLsensibleRecursiveDecomposition()`
* **Mechanism:** 
  The system sweeps continuously through the `window.DecompositionWaveFront`. For every component, it asks the LLM to identify bounded subcomponents. This continues until it reaches an absolute "Leaf" (a physical, implementable module). 
* **State Operations:** 
  - The `KnowledgeNode` graph is cultivated here.
  - Every time a node explodes into child tracks, a new `KnowledgeNode` is implicitly born, and its extracted `rawJsonResponse` boundaries are written down to preserve a strict chronological log of the system's specifications.
* **Architectural Purpose:** Strict data gathering and contextual scoping. Generating the memory graph that will survive the season transition.

---

## 🌸 Spring: Blueprinting (Recomposition Build)
> *"Taking from the knowledge node what we need to build the full pipeline."*

Spring represents the awakening of structural intent. Having broken the "Great Wish" entirely down during Winter, the system now plans exactly how to rebuild it from the bottom up.

* **Trigger Actions:** `handleBuildRecomposition()` & `buildWDLRecompositionPlan()`
* **Mechanism:** 
  The pipeline conducts a Post-Order traversal of the Winter's `Four_Component` decomposition tree. 
* **State Operations:** 
  - The Recomposition `Six_Plan` is built. 
  - Iterative `Recomp` rows are erected.
  - **The Crucial Handoff:** To ensure data continuity without infinite mapping overhead, the `KnowledgeNode` instances authored in Winter are bound *by reference* (`recompRow.knowledgeNode = decompNode.knowledgeNode`) to the newly built Recomposition tracks.
* **Architectural Purpose:** Construction of the execution timeline. It translates raw specifications (the "What") into a scheduled pipeline (the "How").

---

## ☀️ Summer: Active Execution (Auto-Recomposition)
> *"Independently following through on what the system defined. Active labor."*

Summer is the phase of blind, focused execution. The analysis (Winter) and scheduling (Spring) are finished. Summer simply builds.

* **Trigger Actions:** `autoRecomposeAll()`
* **Mechanism:**
  The Recomposition pipeline fires upwards. Leaf nodes generate isolated, concrete software blocks (following instructions inside the exact referenced `KnowledgeNodes`). Because the hierarchy was flipped in Spring, parents wait for their children to finish executing and then actively ingest their generated code/reports, merging them into sequentially larger monolithic deliverables.
* **State Operations:**
  - `buildCodeGenerationPrompt()` isolated execution.
  - LLM callbacks concatenate output up the track hierarchy until it reaches the root.
  - Persistent save states: Passing the final `seven_wish_summary` and the successfully mapped graph back to `localStorage` (the Genie's memory), enriching the soil for the next Autumn.
* **Architectural Purpose:** Delivery. Turning the graph into concrete reality.

---

## Future Integrations
Defining the pipeline with this seasonal model allows developers to easily isolate boundaries:

1. **Prompt Context Isolation:** Winter prompt engines can be heavily context-aware, climbing the tree to read ancestral histories. Summer prompt engines should only care about their immediate leaf and what's written inside their `KnowledgeNode` spec.
2. **UI State Flow:** The GUI can visibly shift modes or aesthetics as the `runFullPipeline()` shifts between these four stages.
3. **Data Integrity:** The rule of seasons establishes a secure *Write/Read asymmetry*: Winter is the only season allowed to *write/mutate* the system intent into the Knowledge Graph, while Spring and Summer are strictly *read-only* consumers of that knowledge.
