# Goal Description

Execute the Recomposition phase automatically by respecting its reversed bottom-up dependency graph. Specifically, we will implement `executeRecompositionNextLayer()` which dynamically executes the next available "column" or "wave" of the recomposition tree, and `autoRecomposeAll()` which loops over the recomposition tree until it is fully resolved. It ensures that synthesized parent tracks only run after all child dependencies converging on `Hyper_Five_Choice` merge nodes are fully complete.

## Proposed Changes

### [Component] Execution Logic

#### [MODIFY] [tableExecutionSuite.js](file:///c:/Users/user/Documents/WDL_2026March23/services/tableExecutionSuite.js)
- Implement **`isTrackFullyExecuted(trackId)`**: Checks if every knot inside a given track has a valid response.
- Implement **`getRecompositionFrontierKnots(TS)`**:
  - Validates that `TS.scenario.recomposition` exists.
  - Performs a layout traversal of the recomposition plan to gather all track IDs.
  - Filters tracks to find "eligible" tracks:
    - A track is eligible if its incoming `parentChoiceId` is a regular `Five_Choice` (usually the `rootRecompChoice`), or if it lacks a parent choice.
    - If its incoming `parentChoiceId` is a `Hyper_Five_Choice` (merge node), it is eligible **only if** all `parentTracks` comprising that merge node are fully completed (`isTrackFullyExecuted` returns true for all).
  - For each eligible track, finds its first unexecuted knot.
  - Returns this array of frontier knots.
- Implement **`executeRecompositionNextLayer(TS)`**:
  - Calls `getRecompositionFrontierKnots()` to grab the next layer.
  - Executes all knots in the frontier concurrently using `Promise.all` over `coreOllamaRequestHTC`.
  - Re-renders the display (`recoalesceAndRenderAll()`) after the layer finishes.
- Implement **`autoRecomposeAll()`**:
  - Enters a loop to repeatedly call `executeRecompositionNextLayer` until the frontier returns zero knots, denoting full system synthesis.


### [Component] User Interface

#### [MODIFY] [WishMachine.html](file:///c:/Users/user/Documents/WDL_2026March23/WishMachine.html)
- Add a new console button labeled **4. Auto-Recompose** inside the `#sweep-console` section, directly below **3. Build Recomposition**.
- Style it distinctly (e.g., using a green/emerald gradient) to represent the final synthesis phase.
- Update the **⚡ Full Pipeline** behavior to optionally include this auto-recomposition phase if desired.

## Open Questions

> [!WARNING]
> **Pipeline Integration**
> Should `autoRecomposeAll()` be automatically appended to the `⚡ Full Pipeline` button sequence, so it runs immediately after Recomposition is built?

> [!NOTE]  
> **Concurrency vs Sequential**
> The design proposes fully concurrent execution for knots in the exact same layer (e.g. executing all 5 leaf nodes at Depth 0 simultaneously) for maximum efficiency. Is your PHP API proxy configured to handle full concurrent HTTP streams correctly as we analyzed in a previous session, or should we execute the layer sequentially?

## Verification Plan

### Manual Verification
1. Launch the `WishMachine.html` interface.
2. Initialize a Sweep, Execute Next Wave up to Wave 2, and Build the Recomposition Plan.
3. Switch views to Recomposition to observe the unexecuted leaf-nodes.
4. Click the newly implemented **4. Auto Recompose** button.
5. Watch the table update layer-by-layer; observe that parents (merge nodes) wait until all their child tracks turn green.
6. Verify no runtime errors are thrown when multiple `coreOllamaRequestHTC` requests fire.
