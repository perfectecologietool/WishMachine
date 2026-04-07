# Five_Choice Rendering in the Dynamic Scenario Table

## Overview

The `Dynamic_Scenario_Table` is an HTML `<table>` where each [Four_Row](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#246-461) occupies its own `<tr>` (table row), and each [Five_Choice](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#567-736) occupies a **single `<td>` cell** that vertically spans multiple rows using `rowSpan`. This creates the visual tree structure where branching points sit in their own column and connect to all their child rows.

## Core Layout Rule

> **Each [Four_Row](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#246-461) = one `<tr>` of infinite horizontal length.**
> **Each [Five_Choice](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#567-736) = one `<td>` spanning `1 + N` rows**, where N = number of branches.

The `rowSpan` formula is:

```
Five_Choice.rowSpan = 1 (parentTrackId row) + N (branches[0..N])
```

## Visual Example

Consider two consecutive [Five_Choice](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#567-736) instances in the same column:

```
┌─────────────────────────────────────────────────┐
│           Five_Choice_A (rowSpan = 4)           │
│  parentTrackId → Row 1  (parent Four_Row)       │
│  branches[0]   → Row 2  (child Four_Row)        │
│  branches[1]   → Row 3  (child Four_Row)        │
│  branches[2]   → Row 4  (child Four_Row)        │
├─────────────────────────────────────────────────┤
│           Five_Choice_B (rowSpan = 3)           │
│  parentTrackId → Row 5  (parent Four_Row)       │
│  branches[0]   → Row 6  (child Four_Row)        │
│  branches[1]   → Row 7  (child Four_Row)        │
└─────────────────────────────────────────────────┘
```

The [Five_Choice](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#567-736) cell visually glues the **parent row** to all its **child branch rows** in a single vertical block.

## Why the Root Plan Starts with a 1-Branch Five_Choice

Every [Six_Plan](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#892-1024) is initialized with a root [Five_Choice("Start here?")](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#567-736) containing **exactly 1 branch** (a default [Four_Row("Start")](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#246-461)):

```javascript
// Six_Plan.initializeDefaultPlan()
var firstChoice = new Five_Choice("Start here?");
var baseTrack = new Four_Row("Start");
firstChoice.addBranch(baseTrack.RegId);
this.steps.push(firstChoice.RegId);
```

This is **not** an accident. Without this initial 1-branch choice:
- The renderer ([recursivelyRenderTrack](file:///c:/Users/user/Documents/WDL_2026March23/renderers/tableRenderer.js#80-178)) would have no entry point.
- The column-offset calculation (`Five_Choice.getOffset()`) would break because it walks the parent chain: `choice → parentTrack → parentChoice → ...`.
- The table's column alignment depends on every [Four_Row](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#246-461) having a `parentChoiceId` pointing to a [Five_Choice](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#567-736). The root choice satisfies this invariant for the very first row.

## The Rendering Algorithm

Defined in [tableRenderer.js](file:///c:/Users/user/Documents/WDL_2026March23/renderers/tableRenderer.js):

### Entry: [renderDynamicScenarioTable(TS)](file:///c:/Users/user/Documents/WDL_2026March23/renderers/tableRenderer.js#42-78)
1. Resolves the active [Six_Plan](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#892-1024) (Decomposition or Recomposition based on `TS.currentView`).
2. Gets the root [Five_Choice](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#567-736) from `plan.steps[0]`.
3. Iterates `rootChoice.branches` and calls [recursivelyRenderTrack()](file:///c:/Users/user/Documents/WDL_2026March23/renderers/tableRenderer.js#80-178) for each.

### Recursion: [recursivelyRenderTrack(trackRegId, parentTR)](file:///c:/Users/user/Documents/WDL_2026March23/renderers/tableRenderer.js#80-178)
For each [Four_Row](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#246-461):

1. **Create a `<tr>`** for this row.
2. **Pad with offset cells** — `Five_Choice.getOffset()` counts how many columns deep this branch is by walking up the parent chain.
3. **Add a connector cell** — colored `<td>` matching `parentChoice.branchesColour`.
4. **Render row header** — `track.yieldRowHeader()`.
5. **Render knots** — iterate `track.sequence`, call `knot.yieldElement()` for each.
6. **Insert the `<tr>`** into the DOM (after `parentTR` or appended to container).
7. **Check `track.terminatingChoice`** — if the row ends in a [Five_Choice](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#567-736) or [Five_Parallel](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#744-802):
   - Call `choice.yieldElement()` to create the choice `<td>` (with `rowSpan = 1` initially set in code, but visually spanning because branches are recursively appended below).
   - **Recurse** for each `choice.branches[i]`.

### The [yieldElement()](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#660-735) Methods

| Class | Behavior |
|---|---|
| [Five_Choice.yieldElement()](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#L664-L734) | Creates a `<td>` with radio buttons for branch selection. Only the selected branch is traversed by [coalesceScenarioToPlan](file:///c:/Users/user/Documents/WDL_2026March23/renderers/tableRenderer.js#181-229). |
| [Five_Parallel.yieldElement()](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#L749-L800) | Creates a `<td>` with labels for all branches. All branches are always traversed (no selection). |
| [Hyper_Five_Choice.yieldElement()](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#L803-L889) | Creates a purple convergence `<td>` listing incoming `parentTrackIds` and one outgoing branch. Used in Recomposition. |

## Column Offset Calculation

`Five_Choice.getOffset()` walks backwards up the parent chain to calculate how many `<td>` padding cells to insert before the current row's content:

```
offset = sum of (1 for each choice + parentTrack.sequence.length + 1 for header)
```

This ensures that deeply nested branches are correctly indented to the right, and the choice cells align vertically in their own column stripe.

## Coalescing: From Tree to Flat Execution Order

[coalesceScenarioToPlan(TS)](file:///c:/Users/user/Documents/WDL_2026March23/renderers/tableRenderer.js#181-229) flattens the tree into a linear `CoalescedPlan.sequence`:
- For [Five_Parallel](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#744-802): recursively enters **all** branches (parallel execution).
- For [Five_Choice](file:///c:/Users/user/Documents/WDL_2026March23/models/WISH.js#567-736): enters **only** `selectedBranchId` (user-selected path).

This flat sequence is rendered in the **Coalesced Execution Plan** table below the main scenario table, providing a linear view of what will actually execute.
