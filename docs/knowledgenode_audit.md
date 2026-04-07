# KnowledgeNode Adoption Audit

Scan of all files in `WDL_2026March23/` for references that should source data from `Four_Component.knowledgeNode` instead of legacy patterns.

---

## Priority 1: Active Code (Currently Running)

### A. [WDLsensibleRecursiveDecomposition](file:///c:/Users/user/Documents/WDL_2026March23/services/wdlEngine.js#1518-1685) — [wdlEngine.js:L1530–L1670](file:///c:/Users/user/Documents/WDL_2026March23/services/wdlEngine.js#L1530-L1670)

This is the **live** decomposition callback. Currently it **writes** to `knowledgeNode` ✅ but also **duplicates** work into `CoSy.nodes`:

| Line | Pattern | Should Use KnowledgeNode? |
|------|---------|--------------------------|
| 1637–1644 | `parentRowForK.knowledgeNode.rawJsonResponse = parsedJsonObj` | ✅ Already done |
| — | Does NOT store `component.name` per-child `knowledgeNode` | ⚠️ Should store `component` JSON on each child's `knowledgeNode` |

### B. `interpolateDecompositionFromParent` — [wdlEngine.js:L1275–L1360](file:///c:/Users/user/Documents/WDL_2026March23/services/wdlEngine.js#L1275-L1360)

| Line | Pattern | Status |
|------|---------|--------|
| 1286 | `rowName = childRow.knowledgeNode.label` | ✅ Already fixed |
| 1295–1303 | Traverse to grandparent `knowledgeNode.rawJsonResponse` | ✅ Already fixed |

### C. [buildWDLRecompositionPlan](file:///c:/Users/user/Documents/WDL_2026March23/services/wdlEngine.js#1819-1988) — [wdlEngine.js:L1860–1870](file:///c:/Users/user/Documents/WDL_2026March23/services/wdlEngine.js#L1860-L1870)

| Line | Pattern | Status |
|------|---------|--------|
| 1862–1867 | `decompNode.knowledgeNode.rawJsonResponse` | ✅ Already fixed |
| 1895 | `subcStr = JSON.stringify(extractedSpec.subcomponents)` | ✅ Uses KnowledgeNode data |

### D. [decompEngine.js](file:///c:/Users/user/Documents/WDL_2026March23/services/decompEngine.js) — [decompEngine.js:L299–600](file:///c:/Users/user/Documents/WDL_2026March23/services/decompEngine.js#L299-L600)

> [!WARNING]
> This file uses **`CoSy.nodes`** (the `archRenderer` ArchNode Map) as its sole source of truth. It does NOT read from `Four_Component.knowledgeNode` at all. This is the **secondary graph system** independent of the WDL table.

| Line | Pattern | Issue |
|------|---------|-------|
| 336 | `CoSy.nodes.forEach(n => { n.isProcessed = false; n.recompKnotRegId = null })` | Resets ArchNode properties directly |
| 350 | `Array.from(CoSy.nodes.values())` | Traverses CoSy ArchNodes, not Four_Component.knowledgeNode |
| 360–361 | `a.knowledgeNode ? a.knowledgeNode.order_of_appearance : a.order_of_appearance` | ⚠️ Has fallback but still reads CoSy nodes |
| 377–378 | `kn.decompKnotRegId` | Reads from CoSy ArchNode, not from Four_Component |
| 484–492 | `kn.cyclicBackReferences` | Reads from CoSy ArchNode |
| 500–503 | `childKn.recompKnotRegId` | Reads from CoSy ArchNode |
| 531 | `kn.isProcessed = true` | Mutates CoSy ArchNode |

**Decision needed**: [decompEngine.js](file:///c:/Users/user/Documents/WDL_2026March23/services/decompEngine.js) builds a Quipu-based recomposition from `CoSy.nodes`. If the WDL-native [buildWDLRecompositionPlan](file:///c:/Users/user/Documents/WDL_2026March23/services/wdlEngine.js#1819-1988) is now the primary recomposition path, this file may be **deprecated**. If it's kept, it should be refactored to traverse `FourRowArray` and read from `Four_Component.knowledgeNode`.

### E. [decompRenderer.js](file:///c:/Users/user/Documents/WDL_2026March23/renderers/decompRenderer.js) — [decompRenderer.js:L306–309](file:///c:/Users/user/Documents/WDL_2026March23/renderers/decompRenderer.js#L306-L309)

| Line | Pattern | Issue |
|------|---------|-------|
| 306–309 | `window.ActiveDecompRecompState.masterJsonTree` | Renders the JSON viewer from `masterJsonTree`. Should optionally also render from KnowledgeNode graph |

---

## Priority 2: Legacy `old_*` Callbacks (Not Active, Low Priority)

These are all prefixed with `old_` and are **not called** by the active pipeline. They sit inside `processingCallbacks` as historical reference.

### `old_sensibleRecursiveDecomposition` (L718–L1025)

| Lines | Pattern |
|-------|---------|
| 781–787 | `masterJsonTree` init/update |
| 817–828 | `CoSy.nodes` ArchNode creation, `order_of_appearance`, `decompKnotRegId` |
| 899–913 | `conceptRegister`, `cyclicBackReferences` |
| 989–1010 | `originArchNode.dependencies.includes(existingNode)` — should be `.knowledgeNode.dependencies` |

### `old_WDLsensibleRecursiveDecomposition` (L1035–L1270)

| Lines | Pattern |
|-------|---------|
| 1093–1097 | `masterJsonTree` init/update |
| 1121–1128 | `CoSy.nodes` ArchNode creation, `decompKnotRegId` |
| 1168–1175 | `conceptRegister`, `cyclicBackReferences` on CoSy nodes |
| 1239 | `originArchNode.dependencies.includes(existingNode)` — should be `.knowledgeNode.dependencies` |

---

## Summary: What Needs Action

| # | Action | File | Priority |
|---|--------|------|----------|
| 1 | Store per-child `component` JSON on each child `Four_Component.knowledgeNode` during decomp | [wdlEngine.js](file:///c:/Users/user/Documents/WDL_2026March23/services/wdlEngine.js) | 🔴 High |
| 2 | Decide: deprecate [decompEngine.js](file:///c:/Users/user/Documents/WDL_2026March23/services/decompEngine.js) OR refactor to traverse `FourRowArray` + `knowledgeNode` | [decompEngine.js](file:///c:/Users/user/Documents/WDL_2026March23/services/decompEngine.js) | 🟡 Medium |
| 3 | Optional: update JSON viewer to render from KnowledgeNode graph instead of `masterJsonTree` | [decompRenderer.js](file:///c:/Users/user/Documents/WDL_2026March23/renderers/decompRenderer.js) | 🟢 Low |
| 4 | Optional: refactor `old_*` callbacks if they'll ever be reactivated | [wdlEngine.js](file:///c:/Users/user/Documents/WDL_2026March23/services/wdlEngine.js) | ⚪ Lowest |
