/**
 * engine.js — Motor de cálculo do CalcFlow  v2
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * DECISÕES TÉCNICAS
 * ─────────────────
 * 1. PARSER RECURSIVO DESCENDENTE (sem `new Function` / `eval`)
 *    A versão anterior usava `new Function(…)` que, mesmo com "use strict" e
 *    lista de bloqueio textual, é trivialmente bypassável: qualquer combinação
 *    de template literals, acesso a prototype/constructor ou closures sobre o
 *    escopo global permite escapar da sandbox.  Um parser próprio garante que
 *    *só* os nós da gramática definida possam ser avaliados — não há superfície
 *    de ataque porque o código nunca é executado como JavaScript.
 *
 *    Gramática suportada (EBNF simplificado):
 *      expr          = additive
 *      additive      = multiplicative ( ('+' | '-') multiplicative )*
 *      multiplicative= unary ( ('*' | '/' | '%') unary )*
 *      unary         = ('-' | '+') unary | power
 *      power         = primary ('^' unary)*        ← açúcar para pow()
 *      primary       = NUMBER | IDENT | call | '(' expr ')'
 *      call          = IDENT '(' arglist ')'
 *      arglist       = expr (',' expr)*
 *
 * 2. TOKENIZADOR EXPLÍCITO
 *    Separar lexer de parser torna os erros de sintaxe precisos
 *    e evita edge-cases de regex ambígua.
 *
 * 3. DETECÇÃO DE DEPENDÊNCIAS PELO TOKENIZADOR
 *    Dependências são extraídas durante a tokenização — um IDENT que não é
 *    nome de função built-in e coincide com o nome de uma aba é uma referência.
 *    Isso resolve o edge case da versão anterior: com regex `\b` simples, uma
 *    aba chamada "s" podia falsamente fazer match dentro de "sin", "sqrt" etc.
 *    Com o tokenizador isso é impossível pois cada token já é classificado.
 *
 * 4. CACHE DE AST E CACHE DE RESULTADO
 *    O AST de cada expressão é cacheado por (tabId, expr).  O resultado só é
 *    recalculado quando a expressão ou algum valor de dependência muda,
 *    identificado por um snapshot hash dos valores relevantes.
 *
 * 5. PROPAGAÇÃO SELETIVA (evaluateDirty)
 *    Ao mudar uma aba, o grafo identifica *quais* abas dependem dela (busca
 *    reversa no grafo) e recalcula apenas esse sub-conjunto na ordem
 *    topológica correta.  O app.js usa `ENGINE.evaluateDirty(changedId, …)`.
 *    O método `evaluateAll` ainda existe para compatibilidade e inicialização.
 *
 * 6. VALIDAÇÃO ESTRITA DE NÚMEROS
 *    `Number()` aceita strings, arrays, null — coerções silenciosas perigosas.
 *    O engine só aceita valores do tipo `number` que passem em `isFinite()`,
 *    rejeitando qualquer coisa diferente com erro explícito.
 *
 * API PÚBLICA (compatível com v1)
 * ────────────────────────────────
 *   ENGINE.evaluate(expr, tabValues, tabId?)  → { result, error, deps }
 *   ENGINE.hasCycle(startId, tabs, nameToId)  → boolean
 *   ENGINE.topoSort(tabList)                  → tabList ordenado
 *   ENGINE.evaluateDirty(changedId, tabList, tabValues) → Map<id, EvalResult>
 *   ENGINE.invalidate(tabId)                  → limpa cache do tabId
 *   ENGINE.formatResult(n)                    → string
 *   ENGINE.FN_NAMES                           → string[]
 *   ENGINE._detectDeps(expr, tabNames)        → string[]
 */

const ENGINE = (() => {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 1 — FUNÇÕES BUILT-IN PERMITIDAS
  // ═══════════════════════════════════════════════════════════════════════════

  const BUILTINS = Object.freeze({
    sin  : Math.sin,   cos  : Math.cos,   tan  : Math.tan,
    asin : Math.asin,  acos : Math.acos,  atan : Math.atan,
    atan2: Math.atan2, sinh : Math.sinh,  cosh : Math.cosh,
    tanh : Math.tanh,  sqrt : Math.sqrt,  cbrt : Math.cbrt,
    pow  : Math.pow,   exp  : Math.exp,   log  : Math.log,
    log2 : Math.log2,  log10: Math.log10, abs  : Math.abs,
    ceil : Math.ceil,  floor: Math.floor, round: Math.round,
    trunc: Math.trunc, sign : Math.sign,  min  : Math.min,
    max  : Math.max,   hypot: Math.hypot,
  });

  const CONSTANTS = Object.freeze({ PI: Math.PI, E: Math.E });

  // Todos os nomes reservados (funções + constantes)
  const BUILTIN_NAMES = new Set([...Object.keys(BUILTINS), ...Object.keys(CONSTANTS)]);

  // Lista de funções para autocomplete
  const FN_NAMES = Object.keys(BUILTINS);


  // ═══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 2 — TOKENIZADOR (LEXER)
  // ═══════════════════════════════════════════════════════════════════════════

  const TT = Object.freeze({ NUM: 'NUM', IDENT: 'IDENT', OP: 'OP', EOF: 'EOF' });

  /**
   * Converte a string de entrada em array de tokens.
   * @param {string} src
   * @returns {Array<{type,value,pos}>}
   * @throws {Error} se houver caractere não reconhecido
   */
  function tokenize(src) {
    const tokens = [];
    let i = 0;

    while (i < src.length) {
      // Espaços
      if (/\s/.test(src[i])) { i++; continue; }

      // Número: inteiro, decimal, notação científica
      if (/[0-9]/.test(src[i]) || (src[i] === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
        let raw = '';
        const start = i;
        while (i < src.length && /[0-9.]/.test(src[i])) raw += src[i++];
        if (i < src.length && (src[i] === 'e' || src[i] === 'E')) {
          raw += src[i++];
          if (i < src.length && (src[i] === '+' || src[i] === '-')) raw += src[i++];
          while (i < src.length && /[0-9]/.test(src[i])) raw += src[i++];
        }
        const val = parseFloat(raw);
        if (!isFinite(val)) throw new Error(`Número inválido: "${raw}"`);
        tokens.push({ type: TT.NUM, value: val, pos: start });
        continue;
      }

      // Identificador: [a-zA-Z_][a-zA-Z0-9_]*
      if (/[a-zA-Z_]/.test(src[i])) {
        let name = '';
        const pos = i;
        while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) name += src[i++];
        tokens.push({ type: TT.IDENT, value: name, pos });
        continue;
      }

      // Operadores e pontuação
      if ('+-*/%^(),'.includes(src[i])) {
        tokens.push({ type: TT.OP, value: src[i], pos: i });
        i++;
        continue;
      }

      throw new Error(`Caractere não reconhecido: "${src[i]}" na posição ${i}`);
    }

    tokens.push({ type: TT.EOF, value: null, pos: src.length });
    return tokens;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 3 — PARSER (produz AST) + EXTRAÇÃO DE DEPENDÊNCIAS
  // ═══════════════════════════════════════════════════════════════════════════

  // Tipos de nó do AST
  const NT = Object.freeze({
    NUMBER: 'NUMBER', CONST: 'CONST', REF: 'REF',
    CALL: 'CALL', UNARY: 'UNARY', BINARY: 'BINARY',
  });

  /**
   * Parser recursivo descendente.
   * @param {Array}    tokens
   * @param {Set}      tabNameSet  - nomes de abas conhecidos
   * @returns {{ ast: Object, deps: Set<string> }}
   */
  function parse(tokens, tabNameSet) {
    let pos = 0;
    const deps = new Set();

    const peek    = ()  => tokens[pos];
    const consume = ()  => tokens[pos++];

    function expect(type, value) {
      const tok = peek();
      if (tok.type !== type || (value !== undefined && tok.value !== value)) {
        const found = tok.value != null ? `"${tok.value}"` : 'EOF';
        const exp   = value != null ? `"${value}"` : type;
        throw new Error(`Esperado ${exp}, encontrado ${found} na posição ${tok.pos}`);
      }
      return consume();
    }

    // ── Gramática ──────────────────────────────────────────

    function parseExpr() { return parseAdditive(); }

    function parseAdditive() {
      let left = parseMultiplicative();
      while (peek().type === TT.OP && (peek().value === '+' || peek().value === '-')) {
        const op = consume().value;
        left = { type: NT.BINARY, op, left, right: parseMultiplicative() };
      }
      return left;
    }

    function parseMultiplicative() {
      let left = parseUnary();
      while (peek().type === TT.OP && '*/%'.includes(peek().value)) {
        const op = consume().value;
        left = { type: NT.BINARY, op, left, right: parseUnary() };
      }
      return left;
    }

    function parseUnary() {
      if (peek().type === TT.OP && (peek().value === '-' || peek().value === '+')) {
        const op = consume().value;
        const operand = parseUnary();
        return op === '-' ? { type: NT.UNARY, op: '-', operand } : operand;
      }
      return parsePower();
    }

    function parsePower() {
      let base = parsePrimary();
      // Direita-associativo: 2^3^2 = 2^(3^2)
      if (peek().type === TT.OP && peek().value === '^') {
        consume();
        const exp = parseUnary();
        base = { type: NT.CALL, name: 'pow', args: [base, exp] };
      }
      return base;
    }

    function parsePrimary() {
      const tok = peek();

      if (tok.type === TT.NUM) {
        consume();
        return { type: NT.NUMBER, value: tok.value };
      }

      if (tok.type === TT.OP && tok.value === '(') {
        consume();
        const inner = parseExpr();
        expect(TT.OP, ')');
        return inner;
      }

      if (tok.type === TT.IDENT) {
        consume();
        const name = tok.value;

        // Chamada de função: nome seguido de '('
        if (peek().type === TT.OP && peek().value === '(') {
          if (!Object.prototype.hasOwnProperty.call(BUILTINS, name)) {
            // Verifica se é nome de aba sendo usada como função (erro claro)
            if (tabNameSet.has(name)) {
              throw new Error(`"${name}" é uma aba, não uma função`);
            }
            throw new Error(`Função desconhecida: "${name}"`);
          }
          consume(); // '('
          const args = [];
          if (!(peek().type === TT.OP && peek().value === ')')) {
            args.push(parseExpr());
            while (peek().type === TT.OP && peek().value === ',') {
              consume();
              args.push(parseExpr());
            }
          }
          expect(TT.OP, ')');
          return { type: NT.CALL, name, args };
        }

        // Constante (PI, E) — verificada antes de aba para precedência correta
        if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) {
          return { type: NT.CONST, name };
        }

        // Referência de aba
        if (tabNameSet.has(name)) {
          deps.add(name);
          return { type: NT.REF, name };
        }

        // Identificador totalmente desconhecido
        throw new Error(`Identificador desconhecido: "${name}"`);
      }

      const found = tok.value != null ? `"${tok.value}"` : 'EOF';
      throw new Error(`Token inesperado: ${found} na posição ${tok.pos}`);
    }

    // ── Parse principal ───────────────────────────────────
    const ast = parseExpr();

    if (peek().type !== TT.EOF) {
      const rem = peek();
      throw new Error(`Token inesperado após expressão: "${rem.value}" na posição ${rem.pos}`);
    }

    return { ast, deps };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 4 — EVALUATOR (caminha o AST com valores concretos)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Avalia recursivamente um nó do AST.
   * @param {Object} node
   * @param {Object} tabValues  - { [nomeDaAba]: number }
   * @returns {number}
   * @throws {Error}
   */
  function evalAST(node, tabValues) {
    switch (node.type) {

      case NT.NUMBER:
        return node.value;

      case NT.CONST:
        return CONSTANTS[node.name];

      case NT.REF: {
        const val = tabValues[node.name];
        // Validação estrita — rejeita qualquer não-número ou não-finito
        if (typeof val !== 'number') {
          throw new Error(`'${node.name}' não possui valor numérico`);
        }
        if (!isFinite(val)) {
          throw new Error(`'${node.name}' contém valor inválido (${val})`);
        }
        return val;
      }

      case NT.UNARY:
        // Apenas '-' chega aqui ('+' é identidade, removido no parser)
        return -(evalAST(node.operand, tabValues));

      case NT.BINARY: {
        const l = evalAST(node.left,  tabValues);
        const r = evalAST(node.right, tabValues);
        switch (node.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/':
            if (r === 0) throw new Error('Divisão por zero');
            return l / r;
          case '%':
            if (r === 0) throw new Error('Módulo por zero');
            return l % r;
          default:
            throw new Error(`Operador desconhecido: "${node.op}"`);
        }
      }

      case NT.CALL: {
        const fn = BUILTINS[node.name];
        if (!fn) throw new Error(`Função interna ausente: "${node.name}"`);
        const args   = node.args.map(a => evalAST(a, tabValues));
        const result = fn(...args);
        if (typeof result !== 'number') {
          throw new Error(`${node.name}() retornou valor não-numérico`);
        }
        return result;
      }

      default:
        throw new Error(`Nó de AST desconhecido: "${node.type}"`);
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 5 — CACHE DE AST E DE RESULTADO
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Cache de AST parseado: Map< tabId → { expr, ast, deps: Set } >
   * Invalidado quando a expressão muda ou a aba é removida.
   */
  const _astCache = new Map();

  /**
   * Cache de resultado: Map< tabId → { expr, hash, result, error } >
   * hash = snapshot serializado dos valores das dependências.
   */
  const _resultCache = new Map();

  /**
   * Invalida ambos os caches para um tabId.
   * Chamado pelo app quando a expressão de uma aba muda.
   */
  function invalidate(tabId) {
    _astCache.delete(tabId);
    _resultCache.delete(tabId);
  }

  /**
   * Hash leve dos valores de dependências relevantes.
   * Suficientemente rápido para mapas pequenos (<30 abas).
   */
  function _depsHash(depsArray, tabValues) {
    return depsArray.slice().sort().map(d => `${d}=${tabValues[d]}`).join('\x00');
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 6 — API PÚBLICA: evaluate
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Avalia `expr` no contexto de `tabValues`.
   *
   * Fluxo:
   *   1. Expr vazia → null (sem erro)
   *   2. AST do cache ou parse novo
   *   3. Checa hash dos valores de dep → retorna resultado cacheado se igual
   *   4. Avalia AST → salva no cache
   *
   * @param {string} expr
   * @param {Object} tabValues   - { [nome]: number }  DEVE conter apenas numbers
   * @param {string} [tabId]     - chave de cache (opcional; sem ID = sem cache)
   * @returns {{ result: number|null, error: string|null, deps: string[] }}
   */
  function evaluate(expr, tabValues = {}, tabId = null) {
    if (!expr || !expr.trim()) {
      return { result: null, error: null, deps: [] };
    }

    const tabNameSet = new Set(Object.keys(tabValues));

    // ── 1. Parse com cache ─────────────────────────────────

    let astEntry = tabId ? _astCache.get(tabId) : null;

    if (!astEntry || astEntry.expr !== expr) {
      try {
        const tokens = tokenize(expr);
        const { ast, deps } = parse(tokens, tabNameSet);
        astEntry = { expr, ast, deps };
        if (tabId) _astCache.set(tabId, astEntry);
      } catch (e) {
        return { result: null, error: _friendlyError(e.message), deps: [] };
      }
    }

    const depsArray = [...astEntry.deps];

    // ── 2. Valida disponibilidade de dependências ──────────

    for (const dep of depsArray) {
      const val = tabValues[dep];
      if (val === undefined || val === null) {
        return { result: null, error: `'${dep}' sem valor`, deps: depsArray };
      }
      if (typeof val !== 'number' || !isFinite(val)) {
        return { result: null, error: `'${dep}' tem erro`, deps: depsArray };
      }
    }

    // ── 3. Cache de resultado ──────────────────────────────

    const hash = _depsHash(depsArray, tabValues);

    if (tabId) {
      const cached = _resultCache.get(tabId);
      if (cached && cached.expr === expr && cached.hash === hash) {
        return { result: cached.result, error: cached.error, deps: depsArray };
      }
    }

    // ── 4. Avaliação ───────────────────────────────────────

    let result = null, error = null;

    try {
      const raw = evalAST(astEntry.ast, tabValues);
      if      (isNaN(raw))     error  = 'Resultado inválido (NaN)';
      else if (!isFinite(raw)) error  = raw > 0 ? '+∞' : '−∞';
      else                     result = raw;
    } catch (e) {
      error = _friendlyError(e.message);
    }

    const out = { result, error, deps: depsArray };
    if (tabId) {
      _resultCache.set(tabId, { expr, hash, result, error });
    }
    return out;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 7 — GRAFO DE DEPENDÊNCIAS E PROPAGAÇÃO SELETIVA
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extrai dependências de uma expressão usando o tokenizador.
   * Muito mais robusto que regex: nunca confunde "s" com "sin", "e" com "exp".
   *
   * @param {string}   expr
   * @param {string[]} tabNames
   * @returns {string[]}
   */
  function _detectDeps(expr, tabNames) {
    if (!expr || !expr.trim()) return [];
    const tabSet = new Set(tabNames);
    const found  = [];
    const seen   = new Set();
    try {
      for (const tok of tokenize(expr)) {
        if (
          tok.type === TT.IDENT &&
          !BUILTIN_NAMES.has(tok.value) &&
          tabSet.has(tok.value) &&
          !seen.has(tok.value)
        ) {
          seen.add(tok.value);
          found.push(tok.value);
        }
      }
    } catch { /* expressão inválida parcial — retorna o que conseguiu */ }
    return found;
  }

  /**
   * Constrói grafo de adjacência inversa: id → Set< ids que dependem dele >.
   */
  function _buildDependentsGraph(tabList) {
    const nameToId   = {};
    const dependents = new Map();
    tabList.forEach(t => { nameToId[t.name] = t.id; dependents.set(t.id, new Set()); });
    for (const tab of tabList) {
      for (const dep of _detectDeps(tab.expr || '', tabList.map(t => t.name))) {
        const depId = nameToId[dep];
        if (depId) dependents.get(depId).add(tab.id);
      }
    }
    return { nameToId, dependents };
  }

  /**
   * Detecta ciclo a partir de startId (DFS com coloração).
   */
  function hasCycle(startId, tabs, nameToId) {
    const visiting = new Set();
    const done     = new Set();

    function dfs(id) {
      if (visiting.has(id)) return true;
      if (done.has(id))     return false;
      visiting.add(id);
      const tab = tabs[id];
      if (tab) {
        for (const dep of _detectDeps(tab.expr || '', Object.keys(nameToId))) {
          const depId = nameToId[dep];
          if (depId && dfs(depId)) return true;
        }
      }
      visiting.delete(id);
      done.add(id);
      return false;
    }

    return dfs(startId);
  }

  /**
   * Ordenação topológica via DFS pós-ordem.
   */
  function topoSort(tabList) {
    const nameToId = {};
    const tabMap   = {};
    tabList.forEach(t => { nameToId[t.name] = t.id; tabMap[t.id] = t; });

    const visited = new Set();
    const order   = [];

    function dfs(id) {
      if (visited.has(id)) return;
      visited.add(id);
      const tab = tabMap[id];
      if (tab) {
        for (const dep of _detectDeps(tab.expr || '', Object.keys(nameToId))) {
          const depId = nameToId[dep];
          if (depId) dfs(depId);
        }
        order.push(tab);
      }
    }

    tabList.forEach(t => dfs(t.id));
    return order;
  }

  /**
   * Propagação seletiva — recalcula apenas o sub-grafo afetado pela mudança.
   *
   * Algoritmo:
   *   1. BFS no grafo de dependentes para encontrar todas as abas "sujas"
   *   2. Invalida o cache de cada aba suja
   *   3. Ordena topologicamente apenas as abas sujas
   *   4. Avalia em ordem, propagando valores novos
   *
   * @param {string}   changedId   - ID da aba que mudou
   * @param {Array}    tabList     - lista completa [{ id, name, expr }]
   * @param {Object}   tabValues   - snapshot atual { [name]: number }
   * @returns {Map<string, { result, error, deps }>}
   */
  function evaluateDirty(changedId, tabList, tabValues) {
    const { nameToId, dependents } = _buildDependentsGraph(tabList);

    // BFS: coleta todas as abas afetadas
    const dirty = new Set([changedId]);
    const queue = [changedId];
    while (queue.length) {
      const id = queue.shift();
      for (const depId of (dependents.get(id) || [])) {
        if (!dirty.has(depId)) { dirty.add(depId); queue.push(depId); }
      }
    }

    // Invalida cache das abas sujas
    dirty.forEach(id => invalidate(id));

    // Ordena topologicamente apenas as abas sujas
    const dirtyTabList = tabList.filter(t => dirty.has(t.id));
    const sorted       = topoSort(dirtyTabList);

    // Avalia em ordem, construindo snapshot local de valores
    const results      = new Map();
    const localValues  = { ...tabValues };

    for (const tab of sorted) {
      const res = evaluate(tab.expr || '', localValues, tab.id);
      results.set(tab.id, res);
      if (res.result !== null && res.error === null) {
        localValues[tab.name] = res.result;
      } else {
        delete localValues[tab.name];
      }
    }

    return results;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 8 — FORMATAÇÃO
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Formata número para exibição:
   * - 12 dígitos significativos máximos
   * - Notação científica apenas para valores extremos (|n| ≥ 1e15 ou |n| < 1e-7)
   * - Remove zeros desnecessários após o decimal
   */
  function formatResult(n) {
    if (n === null || n === undefined) return '';
    if (!isFinite(n)) return String(n);
    const abs = Math.abs(n);
    if (abs !== 0 && (abs >= 1e15 || abs < 1e-7)) {
      // Remove zeros à direita da mantissa: "1.230000e+15" → "1.23e+15"
      return n.toExponential(6).replace(/\.?0+(e)/, '$1');
    }
    return String(parseFloat(n.toPrecision(12)));
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 9 — MENSAGENS DE ERRO AMIGÁVEIS
  // ═══════════════════════════════════════════════════════════════════════════

  function _friendlyError(msg) {
    if (!msg) return 'Erro desconhecido';
    // Mensagens já são amigáveis — apenas trunca se muito longas
    return msg.length > 80 ? msg.slice(0, 80) + '…' : msg;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORTAÇÃO
  // ═══════════════════════════════════════════════════════════════════════════

  return Object.freeze({
    evaluate,
    hasCycle,
    topoSort,
    evaluateDirty,
    invalidate,
    formatResult,
    FN_NAMES,
    _detectDeps,
  });

})();

window.ENGINE = ENGINE;
