/**
 * ui.js — Geração e interação da interface do CalcFlow
 * Renderiza painéis de abas, teclado virtual, histórico e autocomplete
 */

const UI = (() => {

  // ── Constantes de Teclado Virtual ────────────────────────

  const KEYPAD_MOBILE = [
    { label: '7',    val: '7',      cls: '' },
    { label: '8',    val: '8',      cls: '' },
    { label: '9',    val: '9',      cls: '' },
    { label: '÷',    val: '/',      cls: 'key-op' },
    { label: '⌫',    val: 'DEL',    cls: 'key-del' },
    { label: '4',    val: '4',      cls: '' },
    { label: '5',    val: '5',      cls: '' },
    { label: '6',    val: '6',      cls: '' },
    { label: '×',    val: '*',      cls: 'key-op' },
    { label: 'AC',   val: 'CLEAR',  cls: 'key-spec' },
    { label: '1',    val: '1',      cls: '' },
    { label: '2',    val: '2',      cls: '' },
    { label: '3',    val: '3',      cls: '' },
    { label: '−',    val: '-',      cls: 'key-op' },
    { label: '(',    val: '(',      cls: 'key-op' },
    { label: '0',    val: '0',      cls: '' },
    { label: '.',    val: '.',      cls: '' },
    { label: '%',    val: '%',      cls: 'key-op' },
    { label: '+',    val: '+',      cls: 'key-op' },
    { label: ')',    val: ')',      cls: 'key-op' },
    { label: 'sqrt', val: 'sqrt(',  cls: 'key-fn' },
    { label: 'pow',  val: 'pow(',   cls: 'key-fn' },
    { label: 'log',  val: 'log(',   cls: 'key-fn' },
    { label: 'sin',  val: 'sin(',   cls: 'key-fn' },
    { label: '=',    val: 'EVAL',   cls: 'key-eq' },
  ];

  const KEYPAD_DESKTOP = [
    { label: 'sin',  val: 'sin(',   cls: 'key-fn' },
    { label: 'cos',  val: 'cos(',   cls: 'key-fn' },
    { label: 'tan',  val: 'tan(',   cls: 'key-fn' },
    { label: 'sqrt', val: 'sqrt(',  cls: 'key-fn' },
    { label: 'log',  val: 'log(',   cls: 'key-fn' },
    { label: 'pow',  val: 'pow(',   cls: 'key-fn' },
    { label: '7',    val: '7',      cls: '' },
    { label: '8',    val: '8',      cls: '' },
    { label: '9',    val: '9',      cls: '' },
    { label: '÷',    val: '/',      cls: 'key-op' },
    { label: '%',    val: '%',      cls: 'key-op' },
    { label: '⌫',    val: 'DEL',    cls: 'key-del' },
    { label: '4',    val: '4',      cls: '' },
    { label: '5',    val: '5',      cls: '' },
    { label: '6',    val: '6',      cls: '' },
    { label: '×',    val: '*',      cls: 'key-op' },
    { label: '(',    val: '(',      cls: 'key-op' },
    { label: ')',    val: ')',      cls: 'key-op' },
    { label: '1',    val: '1',      cls: '' },
    { label: '2',    val: '2',      cls: '' },
    { label: '3',    val: '3',      cls: '' },
    { label: '−',    val: '-',      cls: 'key-op' },
    { label: 'PI',   val: 'PI',     cls: 'key-fn' },
    { label: 'E',    val: 'E',      cls: 'key-fn' },
    { label: 'AC',   val: 'CLEAR',  cls: 'key-spec' },
    { label: '0',    val: '0',      cls: '' },
    { label: '.',    val: '.',      cls: '' },
    { label: '+',    val: '+',      cls: 'key-op' },
    { label: '=',    val: 'EVAL',   cls: 'key-eq key-wide' },
  ];

  // ── Renderização do painel de uma aba ─────────────────────

  /**
   * Cria o elemento DOM de um painel de aba.
   * @param {Object} tab - { id, name, expr, result, error, history }
   * @returns {HTMLElement}
   */
  function createTabPanel(tab) {
    const panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.id        = `panel-${tab.id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tab-${tab.id}`);
    panel.dataset.tabId = tab.id;

    const isDesktop = window.innerWidth >= 700;
    const keypadKeys = isDesktop ? KEYPAD_DESKTOP : KEYPAD_MOBILE;

    panel.innerHTML = `
      <div class="tab-panel-grid">
        <div class="col-left">
          <!-- Resultado -->
          <div class="result-card" id="result-card-${tab.id}">
            <div class="result-label">Resultado</div>
            <div class="result-value result-empty" id="result-value-${tab.id}">—</div>
            <div class="result-deps" id="result-deps-${tab.id}"></div>
          </div>

          <!-- Dependências -->
          <div class="deps-panel" id="deps-panel-${tab.id}">
            <div class="deps-panel-title">Valores usados</div>
            <div class="deps-grid" id="deps-grid-${tab.id}"></div>
          </div>
        </div>

        <div class="col-right">
          <!-- Expressão -->
          <div class="expr-container" id="expr-container-${tab.id}">
            <div class="expr-topbar">
              <span>Expressão</span>
              <div class="expr-mode-toggle">
                <button class="expr-mode-btn active" data-mode="auto" data-tab="${tab.id}">Auto</button>
                <button class="expr-mode-btn" data-mode="manual" data-tab="${tab.id}">Manual</button>
              </div>
            </div>
            <textarea
              class="expr-input"
              id="expr-input-${tab.id}"
              placeholder="Ex: a + sqrt(b) * 2"
              rows="2"
              spellcheck="false"
              autocorrect="off"
              autocapitalize="off"
              aria-label="Expressão matemática"
            >${tab.expr || ''}</textarea>
            <div class="expr-actions">
              <button class="btn-clear" data-tab="${tab.id}" id="btn-clear-${tab.id}">Limpar</button>
              <button class="btn-eval"  data-tab="${tab.id}" id="btn-eval-${tab.id}">= Calcular</button>
            </div>
          </div>

          <!-- Teclado virtual -->
          <div class="keypad-section" id="keypad-section-${tab.id}">
            <div class="keypad" id="keypad-${tab.id}">
              ${keypadKeys.map(k => `
                <button class="key ${k.cls}" data-val="${k.val}" data-tab="${tab.id}" aria-label="${k.label}">
                  ${k.label}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Histórico -->
          <div class="history-section" id="history-section-${tab.id}">
            <div class="history-header" id="history-header-${tab.id}" role="button" aria-expanded="false">
              <span>Histórico</span>
              <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="history-list" id="history-list-${tab.id}">
              <div class="history-empty">Nenhuma entrada ainda</div>
            </div>
          </div>
        </div>
      </div>
    `;
    return panel;
  }

  /**
   * Cria o elemento DOM de uma aba na barra.
   */
  function createTabItem(tab, isActive) {
    const item = document.createElement('div');
    item.className = `tab-item${isActive ? ' active' : ''}`;
    item.id        = `tab-${tab.id}`;
    item.dataset.tabId = tab.id;
    item.setAttribute('role', 'tab');
    item.setAttribute('aria-selected', isActive ? 'true' : 'false');
    item.title     = tab.name;

    item.innerHTML = `
      <span class="tab-dot"></span>
      <input
        class="tab-name-input"
        type="text"
        value="${_escape(tab.name)}"
        maxlength="20"
        aria-label="Nome da aba"
        readonly
      />
      <span class="tab-close" role="button" aria-label="Fechar aba ${tab.name}" title="Fechar aba">✕</span>
    `;
    return item;
  }

  // ── Atualização do resultado ─────────────────────────────

  function updateResult(tabId, result, error, deps, depValues) {
    const card  = document.getElementById(`result-card-${tabId}`);
    const valEl = document.getElementById(`result-value-${tabId}`);
    const depsEl= document.getElementById(`result-deps-${tabId}`);
    const tabEl = document.getElementById(`tab-${tabId}`);
    if (!card || !valEl) return;

    // Classe de animação
    card.classList.remove('updated', 'has-error');

    if (error) {
      valEl.className = 'result-value result-error';
      valEl.textContent = error;
      card.classList.add('has-error');
      tabEl && tabEl.classList.add('has-error');
      depsEl.innerHTML = '';
    } else if (result === null || result === undefined) {
      valEl.className = 'result-value result-empty';
      valEl.textContent = '—';
      tabEl && tabEl.classList.remove('has-error');
      depsEl.innerHTML = '';
    } else {
      valEl.className = 'result-value';
      valEl.textContent = ENGINE.formatResult(result);
      tabEl && tabEl.classList.remove('has-error');
      // Exibe chips de dependência
      depsEl.innerHTML = deps.length
        ? deps.map(d => `<span class="dep-chip">${_escape(d)}</span>`).join('')
        : '';
    }

    void card.offsetWidth; // forçar reflow para reiniciar animação
    card.classList.add('updated');

    // Painel de dependências com valores
    updateDepsPanel(tabId, deps, depValues);
  }

  function updateDepsPanel(tabId, deps, depValues) {
    const panel = document.getElementById(`deps-panel-${tabId}`);
    const grid  = document.getElementById(`deps-grid-${tabId}`);
    if (!panel || !grid) return;

    if (!deps || deps.length === 0) {
      panel.classList.remove('visible');
      return;
    }
    panel.classList.add('visible');
    grid.innerHTML = deps.map(d => {
      const val = depValues && depValues[d];
      const display = (val !== null && val !== undefined) ? ENGINE.formatResult(val) : '?';
      return `<div class="dep-card" data-dep="${_escape(d)}" role="button" tabindex="0">
        <span class="dep-card-name">${_escape(d)}</span>
        <span class="dep-card-val">${display}</span>
      </div>`;
    }).join('');
  }

  // ── Histórico ────────────────────────────────────────────

  function renderHistory(tabId, entries) {
    const list = document.getElementById(`history-list-${tabId}`);
    if (!list) return;
    if (!entries || entries.length === 0) {
      list.innerHTML = '<div class="history-empty">Nenhuma entrada ainda</div>';
      return;
    }
    list.innerHTML = entries.map(e => `
      <div class="history-item" data-expr="${_escape(e.expr)}" role="button" tabindex="0" aria-label="${_escape(e.expr)} = ${e.result}">
        <span class="history-expr">${_escape(e.expr)}</span>
        <span class="history-result">${_escape(String(e.result ?? e.error ?? ''))}</span>
        <span class="history-ts">${_fmtTime(e.ts)}</span>
      </div>
    `).join('');
  }

  // ── Teclado virtual ──────────────────────────────────────

  function showKeypad(tabId) {
    const s = document.getElementById(`keypad-section-${tabId}`);
    if (s) s.classList.add('visible');
  }
  function hideKeypad(tabId) {
    const s = document.getElementById(`keypad-section-${tabId}`);
    if (s) s.classList.remove('visible');
  }
  function toggleKeypad(tabId) {
    const s = document.getElementById(`keypad-section-${tabId}`);
    if (s) s.classList.toggle('visible');
  }

  // ── Toast ────────────────────────────────────────────────

  function toast(msg, type = 'info', duration = 2800) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => {
      t.classList.add('toast-out');
      setTimeout(() => t.remove(), 250);
    }, duration);
  }

  // ── Autocomplete ─────────────────────────────────────────

  let _acVisible = false;
  let _acItems   = [];
  let _acIndex   = -1;
  let _onAcSelect = null;

  function showAutocomplete(anchorEl, items, onSelect) {
    const dd = document.getElementById('autocomplete-dropdown');
    if (!dd || !items.length) { hideAutocomplete(); return; }
    _acItems   = items;
    _acIndex   = -1;
    _onAcSelect= onSelect;

    dd.innerHTML = items.map((item, i) => `
      <div class="ac-item" data-index="${i}" role="option">
        <span class="ac-item-type ${item.type}">${item.type === 'tab' ? 'aba' : 'fn'}</span>
        <span>${_escape(item.label)}</span>
        ${item.value !== undefined ? `<span class="ac-item-val">${_escape(String(item.value))}</span>` : ''}
      </div>
    `).join('');

    // Posiciona
    const rect = anchorEl.getBoundingClientRect();
    dd.style.left = `${rect.left}px`;
    dd.style.top  = `${rect.bottom + 4}px`;
    dd.style.width= `${Math.max(200, rect.width)}px`;
    dd.classList.add('open');
    _acVisible = true;
  }

  function hideAutocomplete() {
    const dd = document.getElementById('autocomplete-dropdown');
    if (dd) dd.classList.remove('open');
    _acVisible = false;
    _acIndex   = -1;
  }

  function acNavigate(dir) {
    if (!_acVisible) return false;
    const dd = document.getElementById('autocomplete-dropdown');
    const items = dd.querySelectorAll('.ac-item');
    if (!items.length) return false;
    _acIndex = (_acIndex + dir + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle('selected', i === _acIndex));
    return true;
  }

  function acConfirm() {
    if (!_acVisible || _acIndex < 0) return null;
    const item = _acItems[_acIndex];
    if (item && _onAcSelect) _onAcSelect(item);
    hideAutocomplete();
    return item;
  }

  function isAcVisible() { return _acVisible; }

  // ── Helpers privados ─────────────────────────────────────

  function _escape(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _fmtTime(ts) {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  }

  return {
    createTabPanel,
    createTabItem,
    updateResult,
    updateDepsPanel,
    renderHistory,
    showKeypad,
    hideKeypad,
    toggleKeypad,
    toast,
    showAutocomplete,
    hideAutocomplete,
    acNavigate,
    acConfirm,
    isAcVisible,
    KEYPAD_MOBILE,
    KEYPAD_DESKTOP,
  };
})();

window.UI = UI;
