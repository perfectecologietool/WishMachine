# QDL Engine API Reference

`qdl-engine.js` provides four capabilities: **lexing**, **parsing**, **emitting**, and **instantiating**. It also exposes two UI integration functions. All symbols are global (no ES module exports) and available after the script loads.

---

## 1. QDLLexer

**Purpose:** Converts a raw QDL source string into a flat array of typed tokens. Prerequisite for the parser.

### `new QDLLexer(input)`

| | Detail |
|---|---|
| **Input** | `input` — a string of QDL source text |
| **Output** | A `QDLLexer` instance with internal cursor state |

### `QDLLexer.tokenizeAll()`

| | Detail |
|---|---|
| **Purpose** | Consume the entire input and return all tokens at once |
| **Input** | *(none)* — reads from the instance's input string |
| **Output — success** | `QDLToken[]` — ordered array of tokens, always ending with an `EOF` token |
| **Output — failure** | Throws `Error("QDL Lexer: Unexpected character '…' at line:col")` on an unrecognised character |

### `QDLLexer.nextToken()`

| | Detail |
|---|---|
| **Purpose** | Advance one token at a time (streaming use) |
| **Input** | *(none)* |
| **Output — normal** | The next `QDLToken` |
| **Output — end of input** | `QDLToken` with `type = QDLTokenType.EOF` |
| **Output — failure** | Throws `Error` on unrecognised character |

### `QDLToken` properties

| Property | Type | Description |
|---|---|---|
| `type` | `string` | One of the `QDLTokenType` constants |
| `value` | `string` | Raw text of the lexeme |
| `line` | `number` | 1-based line number |
| `column` | `number` | 1-based column number |
| `toString()` | `string` | `"TYPE(value)@line:col"` — useful for debug logging |

### `QDLTokenType` constants (complete set)

Keyword tokens: `KW_QUIPU`, `KW_STRAND`, `KW_KNOT`, `KW_MODEL`, `KW_TYPE`, `KW_CONTEXT`, `KW_CONTEXT_FN`, `KW_PROMPT_SOURCES`, `KW_PROMPT_FN`, `KW_RESPONSE_FN`, `KW_FORCE_JSON`, `KW_STRATEGY`, `KW_TRUE`, `KW_FALSE`, `KW_FOR`, `KW_SENDS_RESPONSE_TO`, `KW_GETS_CONTEXT_FROM`, `KW_USES_FN_PROMPT`, `KW_USES_FN_CONTEXT`, `KW_USES_FN_RESPONSE`

Punctuation: `LBRACE`, `RBRACE`, `COLON`, `SEMICOLON`, `COMMA`, `STAR`

Literals: `INTEGER`, `IDENTIFIER`, `STRING`

Sentinel: `EOF`

---

## 2. QDLParser

**Purpose:** Consumes the token stream from a `QDLLexer` and produces a structured AST.

### `new QDLParser(lexer)`

| | Detail |
|---|---|
| **Input** | `lexer` — a `QDLLexer` instance (does not need to have called `tokenizeAll` first; the constructor calls it internally) |
| **Output** | A `QDLParser` instance; also immediately tokenizes the full input |

### `QDLParser.parseProgram()`

| | Detail |
|---|---|
| **Purpose** | Parse a complete QDL document |
| **Input** | *(none)* — reads from the pre-tokenized token array |
| **Output — success** | A **Program AST** object (see shape below) |
| **Output — failure** | Throws `Error("QDL Parse Error: … at line …, col …")` with the offending token described |

#### Program AST shape

```js
{
  quipus: [
    {
      id: number,             // quipu index (from "quipu N { }")
      strategy: string|null,  // e.g. "SEQUENTIAL", or null if omitted
      strands: [
        {
          quipuId: number,
          id: number,
          name: string|null,  // optional string literal after strand id
          knots: [ KnotAst, … ]
        }
      ],
      knots: [ KnotAst, … ]   // knots declared directly inside quipu block (rare)
    }
  ],
  relations: [ RelationAst, … ],
  looseKnots: [ KnotAst, … ]  // flat-style knots not inside any quipu/strand block
}
```

#### KnotAst shape

```js
{
  address:      { k: number, s: number, q: number, text: "k,s,q" },
  model:        string | null,
  type:         string | null,   // a Knot_Type value
  context:      string[],        // array of "k,s,q" address strings
  promptSources: string[],       // array of "k,s,q" address strings
  contextFn:    string | null,   // function name (without *)
  promptFn:     string | null,
  responseFn:   string | null,
  forceJson:    boolean | null
}
```

#### RelationAst shape

```js
{
  kind: "SENDS_RESPONSE_TO"
      | "GETS_CONTEXT_FROM"
      | "USES_FUNCTION_ON_PROMPT_SOURCE"
      | "USES_FUNCTION_ON_CONTEXT_SOURCE"
      | "USES_FUNCTION_ON_RESPONSE",
  from: string,      // "k,s,q"
  to:   string|null, // "k,s,q" (null for USES_FUNCTION_ON_RESPONSE)
  fn:   string|null  // function name (null for SENDS/GETS)
}
```

---

## 3. `qdlEmit(keychain)`

**Purpose:** Serialise the full live state of a `Keychain` into a QDL source string. This is the **reverse** of parsing — the "toQDL" direction.

| | Detail |
|---|---|
| **Input** | `keychain` — a `Keychain` instance (as stored in `window.ActiveKeychain`) |
| **Output — keychain is valid** | A multiline QDL string, beginning with a comment header, containing `quipu N { strand N { knot N,N,N { … } } }` blocks for every Quipu/Strand/Knot in the keychain |
| **Output — keychain is null/undefined** | Returns the string `"// No keychain loaded\n"` (never throws) |

Fields emitted per knot (only when non-default/non-empty):

| QDL field | Source on Knot |
|---|---|
| `model` | `d3(knot.TC).model` |
| `type` | `knot.knotType` |
| `prompt_sources` | `knot.sourcePromptKnotIds` (skipped if empty) |
| `context` | `knot.sourceContextKnotIds` (skipped if empty) |
| `prompt_fn` | `knot.requestCallbackId` (skipped if `"none"`) |
| `response_fn` | `knot.responseCallbackId` (skipped if `"none"`) |
| `context_fn` | `knot.contextCallbackId` (skipped if `"none"`) |
| `force_json` | `knot.forceJsonOutput` (only emitted if `true`) |

---

## 4. `qdlInstantiate(ast, keychainName?)`

**Purpose:** Materialise a Program AST into live `Keychain`, `Quipu`, `Strand`, and `Knot` objects. This is the **forward** direction — "fromQDL".

| | Detail |
|---|---|
| **Input** | `ast` — a Program AST returned by `QDLParser.parseProgram()` |
| **Input** | `keychainName` *(optional, default `"QDL Keychain"`)* — name string for the new `Keychain` |
| **Output — success** | A new `Keychain` instance with all `Quipu`, `Strand`, and `Knot` objects constructed and cross-wired; also registered in `QuipuArray`, `StrandArray`, `KnotArray` |
| **Output — missing knot in relation** | Logs `console.warn` and skips the relation (does not throw) |
| **Output — missing strand for knot address** | Logs `console.warn`, creates the missing strand, then continues |

Field mapping from KnotAst → Knot instance:

| KnotAst field | Knot property set |
|---|---|
| `type` | `knot.knotType` |
| `context` | `knot.sourceContextKnotIds` |
| `promptSources` | `knot.sourcePromptKnotIds` |
| `promptFn` | `knot.requestCallbackId` |
| `contextFn` | `knot.requestCallbackId` (fallback if no promptFn) |
| `responseFn` | `knot.responseCallbackId` |
| `forceJson` | `knot.forceJsonOutput` |
| `model` | `d3(knot.TC).model` |

Relation semantics applied during instantiation:

| RelationAst kind | Effect |
|---|---|
| `SENDS_RESPONSE_TO` | `toKnot.sourcePromptKnotIds.push(from)` |
| `GETS_CONTEXT_FROM` | `fromKnot.sourceContextKnotIds.push(to)` |
| `USES_FUNCTION_ON_PROMPT_SOURCE` | `targetKnot.requestCallbackId = fn`; `targetKnot.sourcePromptKnotIds.push(from)` |
| `USES_FUNCTION_ON_CONTEXT_SOURCE` | `targetKnot.requestCallbackId = fn`; `targetKnot.sourceContextKnotIds.push(from)` |
| `USES_FUNCTION_ON_RESPONSE` | `fromKnot.responseCallbackId = fn` |

---

## 5. `qdlShadowUpdate()`

**Purpose:** UI integration hook. Reads `window.ActiveKeychain`, calls `qdlEmit()`, and writes the result into `document.getElementById('qdl-live-output').value`. Called automatically after every mutating UI interaction (add/remove knot/strand, field changes, re-render).

| | Detail |
|---|---|
| **Input** | *(none)* — reads from `window.ActiveKeychain` and the DOM |
| **Output — normal** | Updates `#qdl-live-output` textarea value; returns `undefined` |
| **Output — element missing** | Silent no-op (element not found) |
| **Output — error** | Catches internally, logs `console.error("QDL Shadow Update error: …")` |

---

## 6. `applyQDL()`

**Purpose:** Read QDL text from `#qdl-input`, parse it, instantiate a new `Keychain`, replace `window.ActiveKeychain`, and re-render the UI. Attached to the **"Apply QDL"** button in `UXtool.html`.

| | Detail |
|---|---|
| **Input** | *(none)* — reads from `document.getElementById('qdl-input').value` |
| **Output — success** | `window.ActiveKeychain` replaced; `renderActiveQuipu()` called; `qdlShadowUpdate()` called; logs `"QDL applied successfully."` |
| **Output — empty input** | `alert("No QDL text to apply.")` |
| **Output — parse/instantiate error** | `alert("QDL Error: " + e.message)`; logs full error to `console.error` |

---

## 7. Typical Usage Patterns

### A. Parse a QDL string and inspect the AST
```js
const src = `quipu 0 { strand 0 { knot 0,0,0 { model: llama3; type: USER_PROMPT_NO_CONTEXT; } } }`;
const ast = new QDLParser(new QDLLexer(src)).parseProgram();
console.log(ast.quipus[0].strands[0].knots[0].model); // "llama3"
```

### B. Instantiate a Keychain from a QDL string
```js
const ast = new QDLParser(new QDLLexer(src)).parseProgram();
const keychain = qdlInstantiate(ast, "My QDL Keychain");
window.ActiveKeychain = keychain;
renderActiveQuipu();
```

### C. Emit the current Keychain as QDL
```js
const qdlText = qdlEmit(window.ActiveKeychain);
console.log(qdlText);
```

### D. Round-trip (Keychain → QDL → Keychain)
```js
const qdlText = qdlEmit(window.ActiveKeychain);
const ast     = new QDLParser(new QDLLexer(qdlText)).parseProgram();
const clone   = qdlInstantiate(ast, "Cloned Keychain");
```

### E. Lex only (debug / tooling)
```js
const tokens = new QDLLexer(src).tokenizeAll();
tokens.forEach(t => console.log(t.toString()));
```
