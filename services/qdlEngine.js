import { QDLTokenType } from '../core/constants.js';
import { Quipu, Strand, Keychain } from '../models/QuipuModels.js';
import { Knot } from '../models/WISH.js';
import { renderActiveQuipu } from '../renderers/quipuRenderer.js';
import { d2, d3, k1, s1, q1 } from '../core/state.js';
import { Two_Layer } from '../models/WISH.js';

export class QDLToken {
    constructor(type, value, line, column) {
        this.type = type;
        this.value = value;
        this.line = line;
        this.column = column;
    }
    toString() {
        return `${this.type}(${this.value})@${this.line}:${this.column}`;
    }
}

export class QDLLexer {
    constructor(input) {
        this.input = input;
        this.length = input.length;
        this.pos = 0;
        this.line = 1;
        this.column = 1;
    }

    isAtEnd() { return this.pos >= this.length; }
    peek() { return this.isAtEnd() ? '\0' : this.input[this.pos]; }

    advance() {
        const ch = this.peek();
        this.pos++;
        if (ch === '\n') { this.line++; this.column = 1; }
        else { this.column++; }
        return ch;
    }

    skipWhitespaceAndComments() {
        while (!this.isAtEnd()) {
            const ch = this.peek();
            if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
                this.advance(); continue;
            }
            if (ch === '/' && this.pos + 1 < this.length && this.input[this.pos + 1] === '/') {
                this.advance(); this.advance();
                while (!this.isAtEnd() && this.peek() !== '\n') { this.advance(); }
                continue;
            }
            if (ch === '/' && this.pos + 1 < this.length && this.input[this.pos + 1] === '*') {
                this.advance(); this.advance();
                while (!this.isAtEnd()) {
                    const c = this.advance();
                    if (c === '*' && !this.isAtEnd() && this.peek() === '/') { this.advance(); break; }
                }
                continue;
            }
            break;
        }
    }

    isLetter(ch) { return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_'; }
    isDigit(ch) { return ch >= '0' && ch <= '9'; }
    isIdentChar(ch) { return this.isLetter(ch) || this.isDigit(ch) || ch === '_' || ch === '.' || ch === '-'; }

    readIdentifierOrKeyword() {
        const startLine = this.line, startCol = this.column;
        let text = "";
        while (!this.isAtEnd() && this.isIdentChar(this.peek())) { text += this.advance(); }

        const keywords = {
            "quipu": QDLTokenType.KW_QUIPU,
            "strand": QDLTokenType.KW_STRAND,
            "knot": QDLTokenType.KW_KNOT,
            "model": QDLTokenType.KW_MODEL,
            "type": QDLTokenType.KW_TYPE,
            "context": QDLTokenType.KW_CONTEXT,
            "context_fn": QDLTokenType.KW_CONTEXT_FN,
            "prompt_sources": QDLTokenType.KW_PROMPT_SOURCES,
            "prompt_fn": QDLTokenType.KW_PROMPT_FN,
            "response_fn": QDLTokenType.KW_RESPONSE_FN,
            "force_json": QDLTokenType.KW_FORCE_JSON,
            "strategy": QDLTokenType.KW_STRATEGY,
            "true": QDLTokenType.KW_TRUE,
            "false": QDLTokenType.KW_FALSE,
            "FOR": QDLTokenType.KW_FOR,
            "SENDS_RESPONSE_TO": QDLTokenType.KW_SENDS_RESPONSE_TO,
            "GETS_CONTEXT_FROM": QDLTokenType.KW_GETS_CONTEXT_FROM,
            "USES_FUNCTION_ON_PROMPT_SOURCE": QDLTokenType.KW_USES_FN_PROMPT,
            "USES_FUNCTION_ON_CONTEXT_SOURCE": QDLTokenType.KW_USES_FN_CONTEXT,
            "USES_FUNCTION_ON_RESPONSE": QDLTokenType.KW_USES_FN_RESPONSE,
        };
        const kwType = keywords[text];
        return new QDLToken(kwType || QDLTokenType.IDENTIFIER, text, startLine, startCol);
    }

    readNumber() {
        const startLine = this.line, startCol = this.column;
        let text = "";
        while (!this.isAtEnd() && this.isDigit(this.peek())) { text += this.advance(); }
        return new QDLToken(QDLTokenType.INTEGER, text, startLine, startCol);
    }

    readString() {
        const startLine = this.line, startCol = this.column;
        const quote = this.advance(); // consume opening quote
        let text = "";
        while (!this.isAtEnd() && this.peek() !== quote) {
            if (this.peek() === '\\') { this.advance(); } // escape
            text += this.advance();
        }
        if (!this.isAtEnd()) this.advance(); // consume closing quote
        return new QDLToken(QDLTokenType.STRING, text, startLine, startCol);
    }

    nextToken() {
        this.skipWhitespaceAndComments();
        if (this.isAtEnd()) return new QDLToken(QDLTokenType.EOF, "", this.line, this.column);

        const ch = this.peek();
        const sl = this.line, sc = this.column;

        const punctuation = {
            '{': QDLTokenType.LBRACE, '}': QDLTokenType.RBRACE,
            ':': QDLTokenType.COLON, ';': QDLTokenType.SEMICOLON,
            ',': QDLTokenType.COMMA, '*': QDLTokenType.STAR
        };
        if (punctuation[ch]) { this.advance(); return new QDLToken(punctuation[ch], ch, sl, sc); }
        if (ch === '"' || ch === "'") return this.readString();
        if (this.isLetter(ch)) return this.readIdentifierOrKeyword();
        if (this.isDigit(ch)) return this.readNumber();

        throw new Error(`QDL Lexer: Unexpected character '${ch}' at ${this.line}:${this.column}`);
    }

    tokenizeAll() {
        const tokens = [];
        let tok;
        do { tok = this.nextToken(); tokens.push(tok); } while (tok.type !== QDLTokenType.EOF);
        return tokens;
    }
}


// ============================================================
// SECTION 2: PARSER
// ============================================================

export class QDLParser {
    constructor(lexer) {
        this.tokens = lexer.tokenizeAll();
        this.current = 0;
        this.relations = [];
    }

    peek() { return this.tokens[this.current]; }
    isAtEnd() { return this.peek().type === QDLTokenType.EOF; }
    check(type) { return !this.isAtEnd() && this.peek().type === type; }
    advance() { if (!this.isAtEnd()) this.current++; return this.tokens[this.current - 1]; }

    match(...types) {
        for (const t of types) { if (this.check(t)) { this.advance(); return true; } }
        return false;
    }

    expect(type, message) {
        if (this.check(type)) return this.advance();
        const tok = this.peek();
        throw new Error(`QDL Parse Error: ${message} at line ${tok.line}, col ${tok.column}; found ${tok.type}(${tok.value})`);
    }

    // --- Top-level ---
    parseProgram() {
        const quipus = [];
        const looseKnots = [];
        this.relations = [];

        while (!this.isAtEnd()) {
            if (this.match(QDLTokenType.KW_QUIPU)) {
                quipus.push(this.parseQuipuDecl());
            } else if (this.check(QDLTokenType.KW_KNOT)) {
                looseKnots.push(this.parseKnotDecl(null, null));
            } else if (this.check(QDLTokenType.INTEGER)) {
                this.relations.push(this.parseRelationStmt());
            } else {
                const tok = this.peek();
                throw new Error(`QDL Parse Error: Unexpected token ${tok.type} at top-level (line ${tok.line}, col ${tok.column}).`);
            }
        }
        return { quipus, relations: this.relations, looseKnots };
    }

    // --- Declarations ---
    parseQuipuDecl() {
        const idTok = this.expect(QDLTokenType.INTEGER, "Expected quipu id");
        const quipuId = parseInt(idTok.value, 10);
        this.expect(QDLTokenType.LBRACE, "Expected '{' after quipu id");

        const strands = [], knots = [];
        let strategy = null;

        while (!this.check(QDLTokenType.RBRACE) && !this.isAtEnd()) {
            if (this.match(QDLTokenType.KW_STRAND)) {
                strands.push(this.parseStrandDecl(quipuId));
            } else if (this.check(QDLTokenType.KW_KNOT)) {
                knots.push(this.parseKnotDecl(quipuId, null));
            } else if (this.check(QDLTokenType.INTEGER)) {
                this.relations.push(this.parseRelationStmt());
            } else if (this.match(QDLTokenType.KW_STRATEGY)) {
                this.expect(QDLTokenType.COLON, "Expected ':' after 'strategy'");
                const val = this.expect(QDLTokenType.IDENTIFIER, "Expected strategy identifier");
                strategy = val.value;
                this.expect(QDLTokenType.SEMICOLON, "Expected ';' after strategy");
            } else {
                const tok = this.peek();
                throw new Error(`QDL Parse Error: Unexpected token ${tok.type} in quipu block (line ${tok.line}).`);
            }
        }
        this.expect(QDLTokenType.RBRACE, "Expected '}' at end of quipu block");
        return { id: quipuId, strands, knots, strategy };
    }

    parseStrandDecl(quipuId) {
        const idTok = this.expect(QDLTokenType.INTEGER, "Expected strand id");
        const strandId = parseInt(idTok.value, 10);
        // Optional strand name in string
        let strandName = null;
        if (this.check(QDLTokenType.STRING)) {
            strandName = this.advance().value;
        }
        this.expect(QDLTokenType.LBRACE, "Expected '{' after strand id");

        const knots = [];
        while (!this.check(QDLTokenType.RBRACE) && !this.isAtEnd()) {
            if (this.check(QDLTokenType.KW_KNOT)) {
                knots.push(this.parseKnotDecl(quipuId, strandId));
            } else {
                const tok = this.peek();
                throw new Error(`QDL Parse Error: Unexpected ${tok.type} in strand block (line ${tok.line}).`);
            }
        }
        this.expect(QDLTokenType.RBRACE, "Expected '}' at end of strand block");
        return { quipuId, id: strandId, name: strandName, knots };
    }

    parseKnotDecl(quipuIdCtx, strandIdCtx) {
        this.expect(QDLTokenType.KW_KNOT, "Expected 'knot'");
        const addr = this.parseKnotAddress();
        this.expect(QDLTokenType.LBRACE, "Expected '{' after knot address");

        const knotAst = {
            address: addr,
            model: null, type: null,
            context: [], promptSources: [],
            contextFn: null, promptFn: null, responseFn: null,
            forceJson: null
        };

        while (!this.check(QDLTokenType.RBRACE) && !this.isAtEnd()) {
            const tok = this.peek();
            switch (tok.type) {
                case QDLTokenType.KW_MODEL: this.parseFieldIdent(knotAst, 'model'); break;
                case QDLTokenType.KW_TYPE: this.parseFieldIdent(knotAst, 'type'); break;
                case QDLTokenType.KW_CONTEXT: this.parseFieldKnotList(knotAst, 'context'); break;
                case QDLTokenType.KW_PROMPT_SOURCES: this.parseFieldKnotList(knotAst, 'promptSources'); break;
                case QDLTokenType.KW_CONTEXT_FN: this.parseFieldFn(knotAst, 'contextFn'); break;
                case QDLTokenType.KW_PROMPT_FN: this.parseFieldFn(knotAst, 'promptFn'); break;
                case QDLTokenType.KW_RESPONSE_FN: this.parseFieldFn(knotAst, 'responseFn'); break;
                case QDLTokenType.KW_FORCE_JSON: this.parseFieldBool(knotAst, 'forceJson'); break;
                default:
                    throw new Error(`QDL Parse Error: Unexpected ${tok.type} in knot body (line ${tok.line}).`);
            }
        }
        this.expect(QDLTokenType.RBRACE, "Expected '}' at end of knot body");
        return knotAst;
    }

    // --- Field helpers ---
    parseFieldIdent(ast, fieldName) {
        this.advance(); // consume keyword
        this.expect(QDLTokenType.COLON, `Expected ':' after '${fieldName}'`);
        const val = this.expect(QDLTokenType.IDENTIFIER, `Expected identifier for ${fieldName}`);
        ast[fieldName] = val.value;
        this.expect(QDLTokenType.SEMICOLON, `Expected ';' after ${fieldName}`);
    }

    parseFieldKnotList(ast, fieldName) {
        this.advance(); // consume keyword
        this.expect(QDLTokenType.COLON, `Expected ':' after field`);
        ast[fieldName] = this.parseKnotList();
    }

    parseFieldFn(ast, fieldName) {
        this.advance(); // consume keyword
        this.expect(QDLTokenType.COLON, `Expected ':'`);
        this.expect(QDLTokenType.STAR, "Expected '*' before function id");
        const ident = this.expect(QDLTokenType.IDENTIFIER, "Expected function identifier");
        ast[fieldName] = ident.value;
        this.expect(QDLTokenType.SEMICOLON, "Expected ';'");
    }

    parseFieldBool(ast, fieldName) {
        this.advance(); // consume keyword
        this.expect(QDLTokenType.COLON, "Expected ':'");
        if (this.match(QDLTokenType.KW_TRUE)) ast[fieldName] = true;
        else if (this.match(QDLTokenType.KW_FALSE)) ast[fieldName] = false;
        else throw new Error("Expected 'true' or 'false'");
        this.expect(QDLTokenType.SEMICOLON, "Expected ';'");
    }

    // --- Address & List ---
    parseKnotAddress() {
        const kTok = this.expect(QDLTokenType.INTEGER, "Expected knot index");
        this.expect(QDLTokenType.COMMA, "Expected ','");
        const sTok = this.expect(QDLTokenType.INTEGER, "Expected strand index");
        this.expect(QDLTokenType.COMMA, "Expected ','");
        const qTok = this.expect(QDLTokenType.INTEGER, "Expected quipu index");
        const k = parseInt(kTok.value, 10), s = parseInt(sTok.value, 10), q = parseInt(qTok.value, 10);
        return { k, s, q, text: `${k},${s},${q}` };
    }

    parseKnotList() {
        const list = [];
        list.push(this.parseKnotAddress().text);
        while (this.check(QDLTokenType.SEMICOLON)) {
            this.advance();
            if (this.check(QDLTokenType.INTEGER)) {
                list.push(this.parseKnotAddress().text);
            } else { break; }
        }
        return list;
    }

    // --- Relations ---
    isRelationKeyword(t) {
        return [QDLTokenType.KW_SENDS_RESPONSE_TO, QDLTokenType.KW_GETS_CONTEXT_FROM,
        QDLTokenType.KW_USES_FN_PROMPT, QDLTokenType.KW_USES_FN_CONTEXT,
        QDLTokenType.KW_USES_FN_RESPONSE].includes(t);
    }

    parseRelationStmt() {
        const fromAddr = this.parseKnotAddress();
        const relTok = this.peek();
        if (!this.isRelationKeyword(relTok.type)) {
            throw new Error(`QDL Parse Error: Expected relation keyword, found ${relTok.type} (line ${relTok.line}).`);
        }
        const kind = this.advance();

        switch (kind.type) {
            case QDLTokenType.KW_SENDS_RESPONSE_TO: {
                const to = this.parseKnotAddress();
                this.expect(QDLTokenType.SEMICOLON, "Expected ';'");
                return { kind: "SENDS_RESPONSE_TO", from: fromAddr.text, to: to.text, fn: null };
            }
            case QDLTokenType.KW_GETS_CONTEXT_FROM: {
                const to = this.parseKnotAddress();
                this.expect(QDLTokenType.SEMICOLON, "Expected ';'");
                return { kind: "GETS_CONTEXT_FROM", from: fromAddr.text, to: to.text, fn: null };
            }
            case QDLTokenType.KW_USES_FN_PROMPT: {
                this.expect(QDLTokenType.STAR, "Expected '*'");
                const fn = this.expect(QDLTokenType.IDENTIFIER, "Expected fn id");
                this.expect(QDLTokenType.KW_FOR, "Expected 'FOR'");
                const target = this.parseKnotAddress();
                this.expect(QDLTokenType.SEMICOLON, "Expected ';'");
                return { kind: "USES_FUNCTION_ON_PROMPT_SOURCE", from: fromAddr.text, to: target.text, fn: fn.value };
            }
            case QDLTokenType.KW_USES_FN_CONTEXT: {
                this.expect(QDLTokenType.STAR, "Expected '*'");
                const fn = this.expect(QDLTokenType.IDENTIFIER, "Expected fn id");
                this.expect(QDLTokenType.KW_FOR, "Expected 'FOR'");
                const target = this.parseKnotAddress();
                this.expect(QDLTokenType.SEMICOLON, "Expected ';'");
                return { kind: "USES_FUNCTION_ON_CONTEXT_SOURCE", from: fromAddr.text, to: target.text, fn: fn.value };
            }
            case QDLTokenType.KW_USES_FN_RESPONSE: {
                this.expect(QDLTokenType.STAR, "Expected '*'");
                const fn = this.expect(QDLTokenType.IDENTIFIER, "Expected fn id");
                this.expect(QDLTokenType.SEMICOLON, "Expected ';'");
                return { kind: "USES_FUNCTION_ON_RESPONSE", from: fromAddr.text, to: null, fn: fn.value };
            }
        }
    }
}


// ============================================================
// SECTION 3: EMITTER  (Live Quipu State → QDL text)
// ============================================================

/**
 * Emits a complete QDL text representation of the given Keychain.
 * @param {Keychain} keychain - The active Keychain instance.
 * @returns {string} QDL source text.
 */
export function qdlEmit(keychain) {
    if (!keychain || !keychain.quipus) return "// No keychain loaded\n";

    let out = "";
    out += `// QDL — Quipu Declaration Language\n`;
    out += `// Auto-generated from Keychain: ${keychain.name}\n\n`;

    keychain.quipus.forEach((quipuRegId, qIndex) => {
        const quipu = q1(quipuRegId);
        if (!quipu) return;

        out += `quipu ${qIndex} {\n`;
        if (quipu.executionStrategy && quipu.executionStrategy !== 'SEQUENTIAL') {
            out += `  strategy: ${quipu.executionStrategy};\n`;
        }

        quipu.strands.forEach((strandInfo, sIndex) => {
            const strand = s1(strandInfo.strandRegId);
            if (!strand) return;

            const safeName = strand.name ? ` "${strand.name}"` : "";
            out += `  strand ${sIndex}${safeName} {\n`;

            strand.knots.forEach((knotRegId, kIndex) => {
                const knot = k1(knotRegId);
                if (!knot) return;

                out += `    knot ${kIndex},${sIndex},${qIndex} {\n`;

                // Model from Three_Cell
                if (typeof d3 === 'function' && knot.TC !== undefined) {
                    const tc = d3(knot.TC);
                    if (tc && tc.model) {
                        out += `      model: ${tc.model};\n`;
                    }
                }

                // Type
                if (knot.knotType) {
                    out += `      type: ${knot.knotType};\n`;
                }

                // Prompt sources
                if (knot.sourcePromptKnotIds && knot.sourcePromptKnotIds.length > 0) {
                    const addrs = knot.sourcePromptKnotIds.map(a => _normalizeAddr(a)).join("; ");
                    out += `      prompt_sources: ${addrs};\n`;
                }

                // Context sources
                if (knot.sourceContextKnotIds && knot.sourceContextKnotIds.length > 0) {
                    const addrs = knot.sourceContextKnotIds.map(a => _normalizeAddr(a)).join("; ");
                    out += `      context: ${addrs};\n`;
                }

                // Callbacks
                if (knot.requestCallbackId && knot.requestCallbackId !== "none") {
                    out += `      prompt_fn: *${knot.requestCallbackId};\n`;
                }
                if (knot.responseCallbackId && knot.responseCallbackId !== "none") {
                    out += `      response_fn: *${knot.responseCallbackId};\n`;
                }
                if (knot.contextCallbackId && knot.contextCallbackId !== "none") {
                    out += `      context_fn: *${knot.contextCallbackId};\n`;
                }

                // Force JSON
                if (knot.forceJsonOutput === true) {
                    out += `      force_json: true;\n`;
                }

                out += `    }\n`;
            });

            out += `  }\n`;
        });

        out += `}\n\n`;
    });

    return out;
}

/**
 * Normalize a knot address to the "k,s,q" format for emission.
 * The existing system stores addresses as strings like "[0,1]" or "0,1,0".
 */
function _normalizeAddr(addr) {
    if (typeof addr === 'string') {
        // Strip brackets and whitespace
        return addr.replace(/[\[\]\s]/g, '');
    }
    return String(addr);
}




/**
 * Instantiates a new Keychain from a QDL AST.
 * @param {object} ast - The AST from QDLParser.parseProgram().
 * @param {string} keychainName - Name for the new Keychain.
 * @returns {Keychain} A new Keychain instance with all objects created.
 */
export function qdlInstantiate(ast, keychainName = "QDL Keychain") {
    const newKeychain = new Keychain(keychainName);
    newKeychain.quipus = []; // clear defaults

    const knotMap = new Map(); // "k,s,q" → Knot instance

    // 1. Create Quipus and Strands from AST
    ast.quipus.forEach((qAst, qIdx) => {
        const quipu = new Quipu(`QDL Quipu ${qAst.id}`);
        if (qAst.strategy) {
            quipu.executionStrategy = qAst.strategy;
        }

        // Set first quipu as template
        if (qIdx === 0) {
            newKeychain.templateQuipuId = quipu.RegId;
        }
        newKeychain.quipus.push(quipu.RegId);

        qAst.strands.forEach(sAst => {
            const strand = new Strand(sAst.id, sAst.name || `Strand ${sAst.id}`, quipu.RegId);
            const summary = new Two_Layer("summary", `[Summary for Strand ${strand.RegId}]`);
            quipu.strands.push({ strandRegId: strand.RegId, summaryTwoLayerId: summary.RegId });

            sAst.knots.forEach(kAst => {
                const knot = new Knot(strand.RegId, kAst.address.k);
                strand.knots.push(knot.RegId);
                strand.workbitmap.push(false);
                knotMap.set(kAst.address.text, knot);
                _applyKnotAst(knot, kAst);
            });
        });

        // Knots directly inside quipu block (not in a strand)
        qAst.knots.forEach(kAst => {
            // Attempt to find or create strand
            const sId = kAst.address.s;
            let matchingStrandInfo = quipu.strands[sId];
            if (!matchingStrandInfo) {
                console.warn(`QDL: knot ${kAst.address.text} references strand ${sId} which doesn't exist in quipu ${qAst.id}. Creating it.`);
                const strand = new Strand(sId, `Strand ${sId}`, quipu.RegId);
                const summary = new Two_Layer("summary", "");
                quipu.strands.push({ strandRegId: strand.RegId, summaryTwoLayerId: summary.RegId });
                matchingStrandInfo = quipu.strands[quipu.strands.length - 1];
            }
            const strand = s1(matchingStrandInfo.strandRegId);
            const knot = new Knot(strand.RegId, kAst.address.k);
            while (strand.knots.length <= kAst.address.k) {
                strand.knots.push(null);
                strand.workbitmap.push(false);
            }
            strand.knots[kAst.address.k] = knot.RegId;
            knotMap.set(kAst.address.text, knot);
            _applyKnotAst(knot, kAst);
        });
    });

    // 2. Handle loose knots (flat style)
    if (ast.looseKnots) {
        ast.looseKnots.forEach(kAst => {
            console.warn(`QDL: Loose knot ${kAst.address.text} — flat style not fully supported in instantiator.`);
            knotMap.set(kAst.address.text, null); // placeholder
        });
    }

    // 3. Apply relation statements
    for (const rel of ast.relations) {
        const fromKnot = knotMap.get(rel.from);
        if (!fromKnot) { console.warn(`QDL Relation: unknown source knot ${rel.from}`); continue; }

        switch (rel.kind) {
            case "SENDS_RESPONSE_TO": {
                const toKnot = knotMap.get(rel.to);
                if (toKnot) toKnot.sourcePromptKnotIds.push(rel.from);
                break;
            }
            case "GETS_CONTEXT_FROM": {
                const toKnot = knotMap.get(rel.to);
                if (toKnot) fromKnot.sourceContextKnotIds.push(rel.to);
                break;
            }
            case "USES_FUNCTION_ON_PROMPT_SOURCE": {
                const targetKnot = knotMap.get(rel.to);
                if (targetKnot) {
                    targetKnot.requestCallbackId = rel.fn;
                    targetKnot.sourcePromptKnotIds.push(rel.from);
                }
                break;
            }
            case "USES_FUNCTION_ON_CONTEXT_SOURCE": {
                const targetKnot = knotMap.get(rel.to);
                if (targetKnot) {
                    targetKnot.requestCallbackId = rel.fn;
                    targetKnot.sourceContextKnotIds.push(rel.from);
                }
                break;
            }
            case "USES_FUNCTION_ON_RESPONSE": {
                fromKnot.responseCallbackId = rel.fn;
                break;
            }
        }
    }

    return newKeychain;
}

/**
 * Apply AST knot fields onto a live Knot instance.
 */
function _applyKnotAst(knot, kAst) {
    // Strategy and type defaults
    knot.knotType = kAst.type || knot.knotType || (typeof Knot_Type !== 'undefined' ? Knot_Type.USER_PROMPT_NO_CONTEXT : "USER_PROMPT_NO_CONTEXT");

    // Source tracking defaults
    knot.sourceContextKnotIds = kAst.context && kAst.context.length > 0 ? kAst.context.slice() : (knot.sourceContextKnotIds || []);
    knot.sourcePromptKnotIds = kAst.promptSources && kAst.promptSources.length > 0 ? kAst.promptSources.slice() : (knot.sourcePromptKnotIds || []);

    // Callback functions defaults
    knot.requestCallbackId = kAst.promptFn || knot.requestCallbackId || "none";
    knot.contextCallbackId = kAst.contextFn || knot.contextCallbackId || "none";
    knot.responseCallbackId = kAst.responseFn || knot.responseCallbackId || "none";

    // Settings defaults
    knot.forceJsonOutput = typeof kAst.forceJson === "boolean" ? kAst.forceJson : (knot.forceJsonOutput || false);

    // Set model on Three_Cell if available with fallback
    if (typeof d3 === 'function') {
        const tc = d3(knot.TC);
        if (tc) {
            tc.model = kAst.model || tc.model || "llama3.2:3b";
        }
    }
}


// ============================================================
// SECTION 5: SHADOW UPDATE + APPLY QDL (UI integration)
// ============================================================

/**
 * Called after every mutating UI interaction to update the QDL live panel.
 */
export function qdlShadowUpdate() {
    try {
        const outputArea = document.getElementById('qdl-live-output');
        if (outputArea && window.ActiveKeychain) {
            outputArea.value = qdlEmit(window.ActiveKeychain);
        }
    } catch (e) {
        console.error("QDL Shadow Update error:", e);
    }
}

/**
 * Parses QDL text from the input area, instantiates a new Keychain,
 * replaces the active one, and re-renders.
 */
export function applyQDL() {
    const inputArea = document.getElementById('qdl-input');
    if (!inputArea || !inputArea.value.trim()) {
        alert("No QDL text to apply.");
        return;
    }

    try {
        const lexer = new QDLLexer(inputArea.value);
        const parser = new QDLParser(lexer);
        const ast = parser.parseProgram();
        const newKeychain = qdlInstantiate(ast, "QDL Applied Keychain");

        window.ActiveKeychain = newKeychain;
        if (typeof renderActiveQuipu === 'function') {
            renderActiveQuipu();
        } else {
            window.ActiveKeychain.yieldElement('keychain-container');
        }
        qdlShadowUpdate();
        console.log("QDL applied successfully.");
    } catch (e) {
        alert("QDL Error: " + e.message);
        console.error("QDL Apply Error:", e);
    }
}


 // ═══════════════════════════════════════════════════════════════
// QDL Wrapper Functions — imperative Strand/Knot creation for callbacks
// ═══════════════════════════════════════════════════════════════

/**
 * Creates a new Strand on the specified Quipu via wrapper helper mapping over quipu pushStrand.
 * Note: there's an internal bug in original implementation returning q1.pushStrand instead of quipu.pushStrand,
 * which may have been fixed. 
 * @param {number} quipuRegId - RegId of the target Quipu.
 * @returns {number} The RegId of the newly created Strand.
 */
export function qdlw_addStrand(quipuRegId) {
	const quipu = q1(quipuRegId);
	if (!quipu) { throw new Error(`qdlw_addStrand: Quipu ${quipuRegId} not found`); }
	return quipu.pushStrand();
}

/**
 * Creates a new Knot on a Strand with pre-populated prompt, model, and type.
 * @param {number} strandRegId - RegId of the target Strand.
 * @param {string} promptText  - The prompt content to embed in the Knot.
 * @param {string} model       - Ollama model identifier (e.g. "qwen2.5-coder:0.5b").
 * @param {string} knotType    - A Knot_Type value (defaults to USER_PROMPT_NO_CONTEXT).
 * @returns {number} The RegId of the newly created Knot.
 */
export function qdlw_addKnotToStrand(strandRegId, promptText, model, knotType = Knot_Type.USER_PROMPT_NO_CONTEXT) {
	const strand = s1(strandRegId);
	if (!strand) { throw new Error(`qdlw_addKnotToStrand: Strand ${strandRegId} not found`); }
	strand.addKnot();
	const newKnotRegId = strand.knots[strand.knots.length - 1];
	const newKnot = k1(newKnotRegId);
	// Set prompt content
	d2(d3(newKnot.TC).prompt).content = promptText;
	// Set model
	if (model) { d3(newKnot.TC).model = model; }
	// Set knot type
	newKnot.knotType = knotType;
	return newKnotRegId;
}

/**
 * Wires a context dependency: the knot will look to contextAddress for context history.
 * @param {number} knotRegId         - RegId of the knot to wire.
 * @param {string} contextAddressStr - Address string, e.g. "0,0,0".
 */
export function qdlw_wireContext(knotRegId, contextAddressStr) {
	const knot = k1(knotRegId);
	if (!knot) { throw new Error(`qdlw_wireContext: Knot ${knotRegId} not found`); }
	knot.sourceContextKnotIds.push(contextAddressStr);
}

/**
 * Wires a prompt source dependency: the knot will consume the response of the source knot.
 * @param {number} knotRegId         - RegId of the knot to wire.
 * @param {string} sourceAddressStr  - Address string, e.g. "0,0,0".
 */
export function qdlw_wirePromptSource(knotRegId, sourceAddressStr) {
	const knot = k1(knotRegId);
	if (!knot) { throw new Error(`qdlw_wirePromptSource: Knot ${knotRegId} not found`); }
	knot.sourcePromptKnotIds.push(sourceAddressStr);
}

/**
 * Convenience wrapper: wires multiple prompt source addresses at once.
 * @param {number}   knotRegId    - RegId of the knot to wire.
 * @param {string[]} addressArray - Array of address strings.
 */
export function qdlw_wirePromptSources(knotRegId, addressArray) {
	for (const addr of addressArray) {
		qdlw_wirePromptSource(knotRegId, addr);
	}
}
