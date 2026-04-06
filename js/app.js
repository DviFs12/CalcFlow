/**
 * app.js — Controlador principal do CalcFlow
 *
 * Gerencia:
 * - Estado das abas (criação, renomear, excluir)
 * - Motor reativo (avaliação e propagação)
 * - Persistência (IndexedDB)
 * - Autocomplete
 * - Exportação/Importação
 * - PWA install
 * - Tema claro/escuro
 */

(async function CalcFlowApp() {

  // ── Estado global ─────────────────────────────────────────

  /** Mapa de abas: id → { id, name, expr, order, result, error } */
  let tabs       = {};
  let tabOrder   = [];   // array de ids em ordem
  let activeTabId = null;

  /** Modo de avaliação por aba: 'auto' | 'manual' */
  const evalMode = {};

  /** Teclado nativo travado por aba: true = somente teclado virtual */
  const keyboardLocked = {};

  // Histórico em memória: id → [{expr,result,ts}]
  const historyCache = {};

  // ── IDs ───────────────────────────────────────────────────

  function genId() {
    return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
  }

  // ── Inicialização ─────────────────────────────────────────

  async function init() {
    // Carrega tema
    const savedTheme = localStorage.getItem('calcflow_theme') || 'dark';
    document.documentElement.dataset.theme = savedTheme;

    // Carrega abas do IndexedDB
    const savedTabs = await DB.getAllTabs().catch(() => []);

    if (savedTabs.length > 0) {
      savedTabs.forEach(t => {
        tabs[t.id] = t;
        tabOrder.push(t.id);
        evalMode[t.id] = t.evalMode || 'auto';
      });
    } else {
      // Cria abas padrão de demonstração
      const defaults = [
        { name: 'a', expr: '10 + 5' },
        { name: 'b', expr: 'a * 2' },
        { name: 'c', expr: 'a + b' },
      ];
      for (let i = 0; i < defaults.length; i++) {
        const id = genId();
        tabs[id] = { id, name: defaults[i].name, expr: defaults[i].expr, order: i };
        tabOrder.push(id);
        evalMode[id] = 'auto';
        await DB.saveTab(tabs[id]);
      }
    }

    // Carrega histórico em cache
    for (const id of tabOrder) {
      historyCache[id] = await DB.getHistory(id).catch(() => []);
    }

    // Renderiza UI
    renderAllTabs();
    switchToTab(tabOrder[0]);

    // Avalia todas as abas
    evaluateAll();

    // Carrega conversões personalizadas
    await CONVERTER.loadCustom();

    // Registra eventos globais
    bindGlobalEvents();

    // Registra Service Worker
    registerSW();

    // PWA install
    initPWAInstall();
  }

  // ── Renderização ─────────────────────────────────────────

  function renderAllTabs() {
    const tabBar = document.getElementById('tab-bar');
    const main   = document.getElementById('app-main');
    tabBar.innerHTML = '';
    main.innerHTML   = '';

    tabOrder.forEach((id, idx) => {
      const tab = tabs[id];
      // Barra de abas
      const tabEl = UI.createTabItem(tab, id === activeTabId);
      bindTabItemEvents(tabEl, id);
      tabBar.appendChild(tabEl);

      // Painel
      const panel = UI.createTabPanel(tab);
      if (id === activeTabId) panel.classList.add('active');
      bindPanelEvents(panel, id);
      main.appendChild(panel);
    });
  }

  function renderTabBar() {
    const tabBar = document.getElementById('tab-bar');
    tabBar.innerHTML = '';
    tabOrder.forEach(id => {
      const tab   = tabs[id];
      const tabEl = UI.createTabItem(tab, id === activeTabId);
      bindTabItemEvents(tabEl, id);
      tabBar.appendChild(tabEl);
    });
  }

  // ── Troca de aba ─────────────────────────────────────────

  function switchToTab(id) {
    if (!tabs[id]) return;

    // Desativa aba atual
    if (activeTabId) {
      document.getElementById(`tab-${activeTabId}`)?.classList.remove('active');
      document.getElementById(`panel-${activeTabId}`)?.classList.remove('active');
    }

    activeTabId = id;
    document.getElementById(`tab-${id}`)?.classList.add('active');
    document.getElementById(`panel-${id}`)?.classList.add('active');

    // Atualiza histórico
    UI.renderHistory(id, historyCache[id] || []);

    // Foca na expressão
    setTimeout(() => document.getElementById(`expr-input-${id}`)?.focus(), 50);
  }

  // ── Criação de aba ────────────────────────────────────────

  async function addTab() {
    const id    = genId();
    const order = tabOrder.length;
    // Nome automático: letra disponível
    const name  = _nextTabName();
    tabs[id]    = { id, name, expr: '', order };
    tabOrder.push(id);
    evalMode[id] = 'auto';
    historyCache[id] = [];
    await DB.saveTab(tabs[id]);

    // Adiciona à DOM
    const tabBar = document.getElementById('tab-bar');
    const main   = document.getElementById('app-main');
    const tabEl  = UI.createTabItem(tabs[id], false);
    bindTabItemEvents(tabEl, id);
    tabBar.appendChild(tabEl);

    const panel = UI.createTabPanel(tabs[id]);
    bindPanelEvents(panel, id);
    main.appendChild(panel);

    switchToTab(id);
    UI.toast(`Aba "${name}" criada`, 'success');
  }

  function _nextTabName() {
    const existing = new Set(tabOrder.map(id => tabs[id].name));
    const letters  = 'abcdefghijklmnopqrstuvwxyz';
    for (const l of letters) {
      if (!existing.has(l)) return l;
    }
    return `tab${tabOrder.length + 1}`;
  }

  // ── Renomear aba ──────────────────────────────────────────

  async function renameTab(id, newName) {
    newName = newName.trim();
    if (!newName) return false;

    // Valida: apenas identificadores válidos
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
      UI.toast('Nome inválido (use letras, números e _)', 'error');
      return false;
    }

    // Valida: sem conflito
    const conflict = tabOrder.find(tid => tid !== id && tabs[tid].name === newName);
    if (conflict) {
      UI.toast(`Nome "${newName}" já existe`, 'error');
      return false;
    }

    const oldName = tabs[id].name;
    tabs[id].name = newName;
    await DB.saveTab(tabs[id]);

    // Atualiza input da aba
    const inp = document.querySelector(`#tab-${id} .tab-name-input`);
    if (inp) inp.value = newName;

    // Re-avalia tudo pois referências podem usar o nome antigo
    evaluateAll();
    UI.toast(`Renomeado: "${oldName}" → "${newName}"`, 'info');
    return true;
  }

  // ── Excluir aba ───────────────────────────────────────────

  async function deleteTab(id) {
    if (tabOrder.length <= 1) {
      UI.toast('Não é possível excluir a única aba', 'error');
      return;
    }
    const name = tabs[id].name;
    const idx  = tabOrder.indexOf(id);
    tabOrder.splice(idx, 1);
    delete tabs[id];
    delete evalMode[id];
    delete historyCache[id];

    await DB.deleteTab(id);
    await DB.clearHistoryForTab(id);

    // Limpa cache do engine para a aba removida
    ENGINE.invalidate(id);

    // Remove da DOM
    document.getElementById(`tab-${id}`)?.remove();
    document.getElementById(`panel-${id}`)?.remove();

    // Muda para aba adjacente
    const nextId = tabOrder[Math.min(idx, tabOrder.length - 1)];
    switchToTab(nextId);

    evaluateAll();
    UI.toast(`Aba "${name}" removida`, 'info');
  }

  // ── Motor Reativo ─────────────────────────────────────────

  /**
   * Constrói o snapshot de valores atuais { [nome]: number } para todas as
   * abas que já possuem resultado válido.  Usado como contexto de avaliação.
   */
  function _buildTabValues() {
    const tv = {};
    for (const id of tabOrder) {
      const tab = tabs[id];
      if (tab && tab.result !== null && tab.error === null) {
        tv[tab.name] = tab.result;
      }
    }
    return tv;
  }

  /**
   * Avaliação completa (inicialização ou após rename/delete).
   * Usa topoSort para garantir ordem correta e detecta ciclos.
   */
  function evaluateAll() {
    const tabList  = tabOrder.map(id => tabs[id]);
    const sorted   = ENGINE.topoSort(tabList);
    const nameToId = {};
    tabOrder.forEach(id => { nameToId[tabs[id].name] = id; });

    // Invalida todos os caches para recalcular do zero
    tabOrder.forEach(id => ENGINE.invalidate(id));

    const tabValues = {};

    for (const tab of sorted) {
      // Verifica ciclo antes de avaliar
      if (ENGINE.hasCycle(tab.id, tabs, nameToId)) {
        tabs[tab.id].result = null;
        tabs[tab.id].error  = '⚠ Dependência circular!';
        _applyResult(tab.id, { result: null, error: '⚠ Dependência circular!', deps: [] }, tabValues);
        continue;
      }

      const res = ENGINE.evaluate(tab.expr || '', tabValues, tab.id);
      _applyResult(tab.id, res, tabValues);
    }
  }

  /**
   * Aplica um resultado ao estado global e atualiza a UI.
   * Também propaga o valor para o mapa local de valores.
   */
  function _applyResult(id, res, tabValues) {
    const tab = tabs[id];
    if (!tab) return;
    tab.result = res.result;
    tab.error  = res.error;

    if (res.result !== null && res.error === null) {
      tabValues[tab.name] = res.result;
    }

    const depValues = {};
    res.deps.forEach(d => { depValues[d] = tabValues[d] ?? null; });
    UI.updateResult(id, res.result, res.error, res.deps, depValues);
  }

  /**
   * Avaliação seletiva (input do usuário em modo auto ou botão =).
   * Usa ENGINE.evaluateDirty — recalcula apenas as abas afetadas.
   */
  async function evaluateTab(id, saveHistory = false) {
    if (!tabs[id]) return;

    const tabList  = tabOrder.map(tid => tabs[tid]);
    const nameToId = {};
    tabOrder.forEach(tid => { nameToId[tabs[tid].name] = tid; });

    // Invalida cache da aba que mudou; propagação invalida dependentes
    ENGINE.invalidate(id);

    // Verifica ciclo na aba que mudou
    if (ENGINE.hasCycle(id, tabs, nameToId)) {
      const cycleRes = { result: null, error: '⚠ Dependência circular!', deps: [] };
      const tv = _buildTabValues();
      _applyResult(id, cycleRes, tv);
      return;
    }

    // Snapshot de valores *sem* a aba que mudou para começar limpo
    const tabValues = _buildTabValues();
    delete tabValues[tabs[id].name];

    // Avalia apenas o sub-grafo afetado
    const results = ENGINE.evaluateDirty(id, tabList, tabValues);

    // Aplica resultados atualizados em ordem topológica
    const sorted = ENGINE.topoSort(tabList);
    const finalValues = { ...tabValues };
    for (const tab of sorted) {
      const res = results.get(tab.id);
      if (res !== undefined) {
        tabs[tab.id].result = res.result;
        tabs[tab.id].error  = res.error;
        if (res.result !== null && res.error === null) finalValues[tab.name] = res.result;
        const depValues = {};
        res.deps.forEach(d => { depValues[d] = finalValues[d] ?? null; });
        UI.updateResult(tab.id, res.result, res.error, res.deps, depValues);
      }
    }

    // Histórico apenas da aba principal
    if (saveHistory) {
      const tab = tabs[id];
      if (tab && (tab.result !== null || tab.error)) {
        const entry = {
          tabId: id, expr: tab.expr,
          result: tab.result, error: tab.error, ts: Date.now(),
        };
        await DB.addHistoryEntry(entry);
        historyCache[id] = historyCache[id] || [];
        historyCache[id].unshift(entry);
        if (historyCache[id].length > 30) historyCache[id].pop();
        UI.renderHistory(id, historyCache[id]);
      }
    }
  }

  // ── Autocomplete ─────────────────────────────────────────

  let _acDebounce = null;

  function handleExprInput(tabId, textarea) {
    const val     = textarea.value;
    const pos     = textarea.selectionStart;
    const before  = val.slice(0, pos);

    // Extrai token atual (última palavra parcial)
    const match = before.match(/[a-zA-Z_][a-zA-Z0-9_]*$/);

    if (!match || match[0].length < 1) {
      UI.hideAutocomplete();
      return;
    }
    const token = match[0].toLowerCase();

    clearTimeout(_acDebounce);
    _acDebounce = setTimeout(() => {
      const suggestions = _buildSuggestions(token, tabId);
      if (suggestions.length === 0) { UI.hideAutocomplete(); return; }
      UI.showAutocomplete(textarea, suggestions, (item) => {
        _insertSuggestion(textarea, item, match[0]);
        // Dispara avaliação
        if (evalMode[tabId] === 'auto') {
          updateExpr(tabId, textarea.value);
        }
      });
    }, 80);
  }

  function _buildSuggestions(token, currentTabId) {
    const items = [];

    // Abas (exceto a atual)
    tabOrder.forEach(id => {
      if (id === currentTabId) return;
      const tab = tabs[id];
      if (tab.name.toLowerCase().startsWith(token)) {
        const val = tab.result !== null ? ENGINE.formatResult(tab.result) : tab.error || '—';
        items.push({ type: 'tab', label: tab.name, insert: tab.name, value: val });
      }
    });

    // Funções matemáticas
    ENGINE.FN_NAMES.forEach(fn => {
      if (fn.toLowerCase().startsWith(token)) {
        items.push({ type: 'fn', label: fn, insert: `${fn}(` });
      }
    });

    // Constantes
    ['PI', 'E'].forEach(c => {
      if (c.toLowerCase().startsWith(token)) {
        items.push({ type: 'fn', label: c, insert: c });
      }
    });

    return items.slice(0, 8);
  }

  function _insertSuggestion(textarea, item, token) {
    const val  = textarea.value;
    const pos  = textarea.selectionStart;
    const before = val.slice(0, pos);
    const after  = val.slice(pos);

    // Substitui o token parcial pelo item completo
    const newBefore = before.slice(0, before.length - token.length) + item.insert;
    textarea.value  = newBefore + after;

    // Move cursor
    const newPos = newBefore.length;
    textarea.setSelectionRange(newPos, newPos);
    textarea.focus();
  }

  // ── Atualização de expressão ──────────────────────────────

  let _evalDebounce = null;

  async function updateExpr(tabId, expr) {
    if (!tabs[tabId]) return;
    tabs[tabId].expr = expr;

    // Invalida cache imediatamente ao mudar a expressão
    ENGINE.invalidate(tabId);

    // Salva no DB com debounce
    clearTimeout(_evalDebounce);
    _evalDebounce = setTimeout(async () => {
      await DB.saveTab(tabs[tabId]);
      await evaluateTab(tabId);
    }, 300);
  }

  // ── Lock de teclado nativo ──────────────────────────────────

  /**
   * Aplica ou remove o lock do teclado nativo num textarea.
   * Quando travado: readonly + inputmode=none impedem o teclado nativo no mobile.
   * O textarea ainda recebe foco via JS para exibir cursor e permitir keypad virtual.
   */
  function _applyKeyboardLock(id) {
    const ta = document.getElementById(`expr-input-${id}`);
    if (!ta) return;
    if (keyboardLocked[id]) {
      ta.setAttribute('inputmode', 'none');
      ta.setAttribute('readonly', 'true');
      // Mantém cursor visível mas teclado nativo não abre
      ta.addEventListener('click', _focusLockedTextarea);
      ta.addEventListener('touchend', _focusLockedTextarea);
      UI.showKeypad(id);
    } else {
      ta.removeAttribute('inputmode');
      ta.removeAttribute('readonly');
      ta.removeEventListener('click', _focusLockedTextarea);
      ta.removeEventListener('touchend', _focusLockedTextarea);
    }
  }

  function _focusLockedTextarea(e) {
    // Foca sem abrir teclado nativo (inputmode=none já está ativo)
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: false });
  }

  // ── Modal de Conversão ────────────────────────────────────

  /**
   * Abre o modal de conversão.
   * Se `targetTabId` for fornecido, o botão "Usar resultado" insere na aba ativa.
   */
  function openConverterModal(targetTabId) {
    const modal = document.getElementById('conv-modal');
    if (!modal) return;
    modal.dataset.targetTab = targetTabId || '';
    modal.classList.add('open');
    _renderConverterCategories();
  }

  function closeConverterModal() {
    const modal = document.getElementById('conv-modal');
    if (modal) modal.classList.remove('open');
  }

  function _renderConverterCategories() {
    const list = document.getElementById('conv-cat-list');
    if (!list) return;
    const cats = CONVERTER.getAllCategories();
    list.innerHTML = cats.map(c => `
      <button class="conv-cat-btn" data-cat="${c.id}">
        <span class="conv-cat-icon">${c.icon || '⚙️'}</span>
        <span>${c.label}</span>
        ${c.custom ? '<span class="conv-badge-custom">custom</span>' : ''}
      </button>
    `).join('');
    // Custom management row
    list.innerHTML += `<button class="conv-cat-btn conv-cat-add" id="btn-conv-add-custom">
      <span class="conv-cat-icon">＋</span><span>Nova categoria</span>
    </button>`;
    _bindConverterCatEvents();
  }

  function _bindConverterCatEvents() {
    document.querySelectorAll('.conv-cat-btn[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => _showConverterPanel(btn.dataset.cat));
    });
    document.getElementById('btn-conv-add-custom')
      ?.addEventListener('click', _showCustomCategoryForm);
  }

  function _showConverterPanel(catId) {
    const cat = CONVERTER.getCategoryById(catId);
    if (!cat) return;
    const panel = document.getElementById('conv-panel');
    if (!panel) return;
    panel.innerHTML = `
      <div class="conv-panel-header">
        <button class="conv-back-btn" id="btn-conv-back">← Voltar</button>
        <span class="conv-panel-title">${cat.icon || ''} ${cat.label}</span>
        ${cat.custom ? `<button class="conv-delete-cat" data-cat="${catId}" title="Excluir categoria">🗑</button>` : ''}
      </div>
      <div class="conv-inputs">
        <div class="conv-row">
          <input type="number" class="conv-value-input" id="conv-from-val" placeholder="Valor" value="1" />
          <select class="conv-select" id="conv-from-unit">
            ${cat.units.map(u => `<option value="${u.id}">${u.label}</option>`).join('')}
          </select>
        </div>
        <div class="conv-swap-row">
          <button class="conv-swap-btn" id="btn-conv-swap" title="Inverter">⇅</button>
        </div>
        <div class="conv-row">
          <input type="number" class="conv-value-input conv-value-result" id="conv-to-val" placeholder="Resultado" readonly />
          <select class="conv-select" id="conv-to-unit">
            ${cat.units.map((u, i) => `<option value="${u.id}" ${i === 1 ? 'selected' : ''}>${u.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="conv-actions">
        <button class="btn-conv-use" id="btn-conv-use-result">Usar resultado na aba</button>
      </div>
    `;
    panel.dataset.catId = catId;
    panel.classList.add('visible');
    document.getElementById('conv-cat-list').classList.add('hidden');

    const runConv = () => {
      const fromVal  = parseFloat(document.getElementById('conv-from-val').value);
      const fromUnit = document.getElementById('conv-from-unit').value;
      const toUnit   = document.getElementById('conv-to-unit').value;
      if (!isFinite(fromVal)) { document.getElementById('conv-to-val').value = ''; return; }
      const result = CONVERTER.convert(catId, fromUnit, toUnit, fromVal);
      document.getElementById('conv-to-val').value =
        result !== null ? ENGINE.formatResult(result) : '?';
    };

    document.getElementById('conv-from-val')?.addEventListener('input', runConv);
    document.getElementById('conv-from-unit')?.addEventListener('change', runConv);
    document.getElementById('conv-to-unit')?.addEventListener('change', runConv);
    runConv();

    document.getElementById('btn-conv-swap')?.addEventListener('click', () => {
      const fu = document.getElementById('conv-from-unit');
      const tu = document.getElementById('conv-to-unit');
      const fv = document.getElementById('conv-from-val');
      const tv = document.getElementById('conv-to-val');
      const tmpU = fu.value; fu.value = tu.value; tu.value = tmpU;
      const tmpV = fv.value; fv.value = tv.value;
      runConv();
    });

    document.getElementById('btn-conv-back')?.addEventListener('click', () => {
      panel.classList.remove('visible');
      panel.innerHTML = '';
      document.getElementById('conv-cat-list').classList.remove('hidden');
    });

    document.querySelector('.conv-delete-cat')?.addEventListener('click', async (e) => {
      const cid = e.currentTarget.dataset.cat;
      if (!confirm('Excluir esta categoria personalizada?')) return;
      await CONVERTER.deleteCustomCategory(cid);
      panel.classList.remove('visible');
      panel.innerHTML = '';
      document.getElementById('conv-cat-list').classList.remove('hidden');
      _renderConverterCategories();
      UI.toast('Categoria removida', 'info');
    });

    document.getElementById('btn-conv-use-result')?.addEventListener('click', () => {
      const modal   = document.getElementById('conv-modal');
      const tid     = modal?.dataset.targetTab;
      const resultV = document.getElementById('conv-to-val').value;
      if (!resultV || resultV === '?') return;
      if (tid && tabs[tid]) {
        const ta = document.getElementById(`expr-input-${tid}`);
        if (ta) {
          const start = ta.selectionStart ?? ta.value.length;
          const end   = ta.selectionEnd   ?? ta.value.length;
          ta.value = ta.value.slice(0, start) + resultV + ta.value.slice(end);
          ta.setSelectionRange(start + resultV.length, start + resultV.length);
          tabs[tid].expr = ta.value;
          if (evalMode[tid] === 'auto') updateExpr(tid, ta.value);
        }
      }
      closeConverterModal();
    });
  }

  function _showCustomCategoryForm() {
    const panel = document.getElementById('conv-panel');
    if (!panel) return;
    panel.innerHTML = `
      <div class="conv-panel-header">
        <button class="conv-back-btn" id="btn-cust-back">← Voltar</button>
        <span class="conv-panel-title">Nova categoria</span>
      </div>
      <div class="cust-form">
        <label class="cust-label">Nome da categoria</label>
        <input class="cust-input" id="cust-cat-name" placeholder="Ex: Energia" maxlength="30" />
        <label class="cust-label">Ícone (emoji)</label>
        <input class="cust-input" id="cust-cat-icon" placeholder="⚡" maxlength="4" value="⚙️" />
        <label class="cust-label">Unidades (mínimo 2)</label>
        <div id="cust-units-list"></div>
        <button class="btn-cust-add-unit" id="btn-cust-add-unit">+ Adicionar unidade</button>
        <p class="cust-hint">A primeira unidade é a unidade base (fator = 1). As demais têm fator relativo a ela.</p>
        <button class="btn-cust-save" id="btn-cust-save">Salvar categoria</button>
      </div>
    `;
    panel.classList.add('visible');
    document.getElementById('conv-cat-list').classList.add('hidden');

    let unitCount = 0;
    function addUnitRow(label = '', factor = '1') {
      const idx  = unitCount++;
      const row  = document.createElement('div');
      row.className = 'cust-unit-row';
      row.innerHTML = `
        <input class="cust-input cust-unit-label" placeholder="Nome (ex: Joule)" value="${label}" maxlength="20" />
        <input class="cust-input cust-unit-factor" type="number" placeholder="Fator" value="${factor}" min="0" step="any" />
        <button class="cust-unit-remove" title="Remover">✕</button>
      `;
      row.querySelector('.cust-unit-remove').addEventListener('click', () => row.remove());
      document.getElementById('cust-units-list').appendChild(row);
    }
    addUnitRow('Base', '1');
    addUnitRow('', '');

    document.getElementById('btn-cust-add-unit')?.addEventListener('click', () => addUnitRow());
    document.getElementById('btn-cust-back')?.addEventListener('click', () => {
      panel.classList.remove('visible'); panel.innerHTML = '';
      document.getElementById('conv-cat-list').classList.remove('hidden');
    });
    document.getElementById('btn-cust-save')?.addEventListener('click', async () => {
      const name  = document.getElementById('cust-cat-name').value.trim();
      const icon  = document.getElementById('cust-cat-icon').value.trim() || '⚙️';
      if (!name) { UI.toast('Nome obrigatório', 'error'); return; }
      const rows  = document.querySelectorAll('.cust-unit-row');
      const units = [];
      for (const row of rows) {
        const lbl = row.querySelector('.cust-unit-label').value.trim();
        const fac = parseFloat(row.querySelector('.cust-unit-factor').value);
        if (!lbl || !isFinite(fac) || fac <= 0) { UI.toast('Preencha todas as unidades com fator > 0', 'error'); return; }
        units.push({ id: lbl.toLowerCase().replace(/\s+/g,'_') + '_' + Date.now(), label: lbl, factor: fac });
      }
      if (units.length < 2) { UI.toast('Mínimo de 2 unidades', 'error'); return; }
      const cat = { id: 'cust_' + Date.now(), name, label: name, icon, units };
      await CONVERTER.saveCustomCategory(cat);
      panel.classList.remove('visible'); panel.innerHTML = '';
      document.getElementById('conv-cat-list').classList.remove('hidden');
      _renderConverterCategories();
      UI.toast(`Categoria "${name}" criada!`, 'success');
    });
  }

  // ── Eventos de painel ─────────────────────────────────────

  function bindPanelEvents(panel, id) {
    // Textarea de expressão
    const textarea = panel.querySelector(`#expr-input-${id}`);
    if (textarea) {
      textarea.addEventListener('input', () => {
        if (evalMode[id] === 'auto') {
          updateExpr(id, textarea.value);
        }
        handleExprInput(id, textarea);
      });

      textarea.addEventListener('keydown', (e) => {
        if (UI.isAcVisible()) {
          if (e.key === 'ArrowDown')  { e.preventDefault(); UI.acNavigate(1); }
          if (e.key === 'ArrowUp')    { e.preventDefault(); UI.acNavigate(-1); }
          if (e.key === 'Tab' || e.key === 'Enter') {
            const item = UI.acConfirm();
            if (item) {
              e.preventDefault();
              if (evalMode[id] === 'auto') updateExpr(id, textarea.value);
            }
          }
          if (e.key === 'Escape') UI.hideAutocomplete();
          return;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          evaluateTab(id, true);
        }
      });

      textarea.addEventListener('blur', () => {
        setTimeout(() => UI.hideAutocomplete(), 150);
      });

      textarea.addEventListener('focus', () => {
        if (keyboardLocked[id]) {
          // Teclado travado: impede teclado nativo imediatamente
          textarea.blur();
          return;
        }
        if (window.innerWidth < 700) {
          UI.showKeypad(id);
        }
      });
    }

    // Botão calcular
    const btnEval = panel.querySelector(`#btn-eval-${id}`);
    if (btnEval) {
      btnEval.addEventListener('click', () => {
        const ta = document.getElementById(`expr-input-${id}`);
        if (ta) tabs[id].expr = ta.value;
        evaluateTab(id, true);
      });
    }

    // Botão limpar
    const btnClear = panel.querySelector(`#btn-clear-${id}`);
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        const ta = document.getElementById(`expr-input-${id}`);
        if (ta) ta.value = '';
        tabs[id].expr = '';
        DB.saveTab(tabs[id]);
        evaluateAll();
        UI.updateResult(id, null, null, [], {});
      });
    }

    // Modo Auto/Manual
    const modeBtns = panel.querySelectorAll('.expr-mode-btn');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        evalMode[id] = btn.dataset.mode;
        tabs[id].evalMode = evalMode[id];
        DB.saveTab(tabs[id]);
      });
    });

    // ── Handler unificado para teclado base + expandido ──────
    function _handleKeyClick(val, ta) {
      if (!ta) return;
      if (val === 'NOOP') return;
      if (val === 'LOCK') {
        keyboardLocked[id] = !keyboardLocked[id];
        UI.setKeyboardLock(id, keyboardLocked[id]);
        _applyKeyboardLock(id);
        return;
      }
      if (val === 'EXPAND') {
        UI.toggleExpandedKeypad(id);
        return;
      }
      if (val === 'CONV') {
        openConverterModal(id);
        return;
      }
      if (val === 'DEL') {
        const start = ta.selectionStart, end = ta.selectionEnd;
        if (start !== end) {
          ta.value = ta.value.slice(0, start) + ta.value.slice(end);
          ta.setSelectionRange(start, start);
        } else if (start > 0) {
          ta.value = ta.value.slice(0, start - 1) + ta.value.slice(start);
          ta.setSelectionRange(start - 1, start - 1);
        }
      } else if (val === 'CLEAR') {
        ta.value = '';
      } else if (val === 'EVAL') {
        tabs[id].expr = ta.value;
        evaluateTab(id, true);
        return;
      } else {
        const start = ta.selectionStart, end = ta.selectionEnd;
        ta.value = ta.value.slice(0, start) + val + ta.value.slice(end);
        ta.setSelectionRange(start + val.length, start + val.length);
      }
      tabs[id].expr = ta.value;
      if (evalMode[id] === 'auto') updateExpr(id, ta.value);
      ta.focus();
    }

    // Teclado base
    const keypad = panel.querySelector(`#keypad-${id}`);
    if (keypad) {
      keypad.addEventListener('click', (e) => {
        const key = e.target.closest('.key');
        if (!key) return;
        _handleKeyClick(key.dataset.val, document.getElementById(`expr-input-${id}`));
      });
    }

    // Teclado expandido
    const keypadExt = panel.querySelector(`#keypad-ext-${id}`);
    if (keypadExt) {
      keypadExt.addEventListener('click', (e) => {
        const key = e.target.closest('.key');
        if (!key) return;
        _handleKeyClick(key.dataset.val, document.getElementById(`expr-input-${id}`));
      });
    }

    // Botão fechar expanded
    const btnExpandClose = panel.querySelector(`.btn-expanded-close[data-tab="${id}"]`);
    if (btnExpandClose) {
      btnExpandClose.addEventListener('click', () => UI.hideExpandedKeypad(id));
    }

    // Histórico toggle
    const histHeader = panel.querySelector(`#history-header-${id}`);
    if (histHeader) {
      histHeader.addEventListener('click', () => {
        const list = panel.querySelector(`#history-list-${id}`);
        const open = list.classList.toggle('visible');
        histHeader.classList.toggle('open', open);
        histHeader.setAttribute('aria-expanded', open);
        if (open) UI.renderHistory(id, historyCache[id] || []);
      });
    }

    // Clicar em item do histórico → restaura expressão
    const histList = panel.querySelector(`#history-list-${id}`);
    if (histList) {
      histList.addEventListener('click', (e) => {
        const item = e.target.closest('.history-item');
        if (!item) return;
        const expr = item.dataset.expr;
        const ta   = document.getElementById(`expr-input-${id}`);
        if (ta) { ta.value = expr; }
        tabs[id].expr = expr;
        evaluateTab(id, false);
      });
    }

    // Clicar em dep-card → vai para aba dependência
    const depsGrid = panel.querySelector(`#deps-grid-${id}`);
    if (depsGrid) {
      depsGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.dep-card');
        if (!card) return;
        const depName = card.dataset.dep;
        const depId = tabOrder.find(tid => tabs[tid].name === depName);
        if (depId) switchToTab(depId);
      });
    }
  }

  // ── Eventos de aba (barra) ────────────────────────────────

  function bindTabItemEvents(tabEl, id) {
    // Clique na aba → troca
    tabEl.addEventListener('click', (e) => {
      if (e.target.closest('.tab-close')) return;
      if (e.target.classList.contains('tab-name-input')) return;
      switchToTab(id);
    });

    // Fechar aba
    const closeBtn = tabEl.querySelector('.tab-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTab(id);
      });
    }

    // Renomear ao clicar no input
    const inp = tabEl.querySelector('.tab-name-input');
    if (inp) {
      inp.addEventListener('dblclick', () => {
        inp.removeAttribute('readonly');
        inp.focus();
        inp.select();
      });
      inp.addEventListener('click', (e) => {
        if (activeTabId === id) {
          e.stopPropagation();
          inp.removeAttribute('readonly');
          inp.focus();
        } else {
          switchToTab(id);
        }
      });
      inp.addEventListener('blur', async () => {
        inp.setAttribute('readonly', true);
        const ok = await renameTab(id, inp.value);
        if (!ok) inp.value = tabs[id]?.name || '';
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
        if (e.key === 'Escape') {
          inp.value = tabs[id]?.name || '';
          inp.blur();
        }
      });
    }
  }

  // ── Eventos globais ───────────────────────────────────────

  function bindGlobalEvents() {
    // Nova aba
    document.getElementById('btn-add-tab')?.addEventListener('click', addTab);

    // Tema
    document.getElementById('btn-theme')?.addEventListener('click', () => {
      const current = document.documentElement.dataset.theme || 'dark';
      const next    = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('calcflow_theme', next);
    });

    // Exportar
    document.getElementById('btn-export')?.addEventListener('click', async () => {
      const data = await DB.exportAll();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `calcflow_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      UI.toast('Sessão exportada!', 'success');
    });

    // Importar
    document.getElementById('btn-import')?.addEventListener('click', () => {
      document.getElementById('import-file-input')?.click();
    });
    document.getElementById('import-file-input')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await DB.importAll(data);
        UI.toast('Sessão importada! Recarregando...', 'success');
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        UI.toast(`Erro ao importar: ${err.message}`, 'error');
      }
      e.target.value = '';
    });

    // Modal de conversão — fechar
    document.getElementById('conv-modal-close')
      ?.addEventListener('click', closeConverterModal);
    document.getElementById('conv-modal')
      ?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeConverterModal();
      });

    // Botão de conversão no header
    document.getElementById('btn-converter')
      ?.addEventListener('click', () => openConverterModal(activeTabId));

    // Fecha autocomplete ao clicar fora
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.autocomplete-dropdown') && !e.target.closest('.expr-input')) {
        UI.hideAutocomplete();
      }
    });

    // Clique em item do autocomplete
    document.getElementById('autocomplete-dropdown')?.addEventListener('click', (e) => {
      const item = e.target.closest('.ac-item');
      if (!item) return;
      const idx = parseInt(item.dataset.index);
      // Seleciona e confirma
      for (let i = 0; i < idx; i++) UI.acNavigate(1);
      UI.acConfirm();
    });
  }

  // ── Service Worker ────────────────────────────────────────

  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.warn('SW registration failed:', err);
      });
    }
  }

  // ── PWA Install ───────────────────────────────────────────

  let _deferredInstall = null;

  function initPWAInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      _deferredInstall = e;
      const banner = document.getElementById('install-banner');
      if (banner && !localStorage.getItem('pwa_dismissed')) {
        banner.style.display = 'flex';
      }
    });

    document.getElementById('btn-install')?.addEventListener('click', async () => {
      if (!_deferredInstall) return;
      _deferredInstall.prompt();
      const { outcome } = await _deferredInstall.userChoice;
      if (outcome === 'accepted') {
        UI.toast('CalcFlow instalado! 🎉', 'success');
      }
      _deferredInstall = null;
      document.getElementById('install-banner').style.display = 'none';
    });

    document.getElementById('btn-dismiss-install')?.addEventListener('click', () => {
      document.getElementById('install-banner').style.display = 'none';
      localStorage.setItem('pwa_dismissed', '1');
    });
  }

  // ── Start ─────────────────────────────────────────────────
  init();

})();
