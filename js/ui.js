/**
 * ui.js — Interface do CalcFlow v3
 * Novidades: teclado bloqueável, keypad expandido com mais operações
 */

const UI = (() => {

  // ── Teclado base (sempre visível) ─────────────────────────
  // 5 colunas — compacto e limpo
  const KEYPAD_BASE = [
    { label: '7',   val: '7',     cls: '' },
    { label: '8',   val: '8',     cls: '' },
    { label: '9',   val: '9',     cls: '' },
    { label: '÷',   val: '/',     cls: 'key-op' },
    { label: '⌫',   val: 'DEL',   cls: 'key-del' },
    { label: '4',   val: '4',     cls: '' },
    { label: '5',   val: '5',     cls: '' },
    { label: '6',   val: '6',     cls: '' },
    { label: '×',   val: '*',     cls: 'key-op' },
    { label: 'AC',  val: 'CLEAR', cls: 'key-spec' },
    { label: '1',   val: '1',     cls: '' },
    { label: '2',   val: '2',     cls: '' },
    { label: '3',   val: '3',     cls: '' },
    { label: '−',   val: '-',     cls: 'key-op' },
    { label: '(',   val: '(',     cls: 'key-op' },
    { label: '0',   val: '0',     cls: '' },
    { label: '.',   val: '.',     cls: '' },
    { label: '%',   val: '%',     cls: 'key-op' },
    { label: '+',   val: '+',     cls: 'key-op' },
    { label: ')',   val: ')',     cls: 'key-op' },
    // Linha de controle
    { label: '🔒',  val: 'LOCK',  cls: 'key-lock', title: 'Travar teclado nativo' },
    { label: '⇄',   val: 'CONV',  cls: 'key-conv', title: 'Converter unidades' },
    { label: 'f(x)', val: 'EXPAND', cls: 'key-expand', title: 'Mais operações' },
    { label: '⊞ aba', val: 'TAB_SELECT', cls: 'key-tab-select', title: 'Inserir valor de outra aba' },
    { label: '=',   val: 'EVAL',  cls: 'key-eq' },
  ];

  // ── Teclado expandido (painel deslizante) ─────────────────
  // 4 colunas
  const KEYPAD_EXPANDED = [
    // Trigonometria
    { label: 'sin',   val: 'sin(',   cls: 'key-fn', group: 'trig' },
    { label: 'cos',   val: 'cos(',   cls: 'key-fn', group: 'trig' },
    { label: 'tan',   val: 'tan(',   cls: 'key-fn', group: 'trig' },
    { label: 'asin',  val: 'asin(',  cls: 'key-fn', group: 'trig' },
    { label: 'acos',  val: 'acos(',  cls: 'key-fn', group: 'trig' },
    { label: 'atan',  val: 'atan(',  cls: 'key-fn', group: 'trig' },
    { label: 'sinh',  val: 'sinh(',  cls: 'key-fn', group: 'trig' },
    { label: 'cosh',  val: 'cosh(',  cls: 'key-fn', group: 'trig' },
    // Potência / raiz
    { label: 'x²',    val: '^2',     cls: 'key-fn', group: 'pow' },
    { label: 'x³',    val: '^3',     cls: 'key-fn', group: 'pow' },
    { label: 'xⁿ',    val: '^',      cls: 'key-fn', group: 'pow' },
    { label: '√',     val: 'sqrt(',  cls: 'key-fn', group: 'pow' },
    { label: '∛',     val: 'cbrt(',  cls: 'key-fn', group: 'pow' },
    { label: 'pow',   val: 'pow(',   cls: 'key-fn', group: 'pow' },
    { label: 'exp',   val: 'exp(',   cls: 'key-fn', group: 'pow' },
    { label: 'hypot', val: 'hypot(', cls: 'key-fn', group: 'pow' },
    // Logaritmo
    { label: 'ln',    val: 'log(',   cls: 'key-fn', group: 'log' },
    { label: 'log₂',  val: 'log2(',  cls: 'key-fn', group: 'log' },
    { label: 'log₁₀', val: 'log10(', cls: 'key-fn', group: 'log' },
    { label: 'logₙ',  val: 'log(',   cls: 'key-fn', group: 'log' },
    // Arredondamento / sinal
    { label: '|x|',   val: 'abs(',   cls: 'key-fn', group: 'round' },
    { label: '⌈x⌉',   val: 'ceil(',  cls: 'key-fn', group: 'round' },
    { label: '⌊x⌋',   val: 'floor(', cls: 'key-fn', group: 'round' },
    { label: 'round', val: 'round(', cls: 'key-fn', group: 'round' },
    { label: 'trunc', val: 'trunc(', cls: 'key-fn', group: 'round' },
    { label: 'sign',  val: 'sign(',  cls: 'key-fn', group: 'round' },
    { label: 'min',   val: 'min(',   cls: 'key-fn', group: 'round' },
    { label: 'max',   val: 'max(',   cls: 'key-fn', group: 'round' },
    // Constantes
    { label: 'π',     val: 'PI',     cls: 'key-fn key-const', group: 'const' },
    { label: 'e',     val: 'E',      cls: 'key-fn key-const', group: 'const' },
    { label: ',',     val: ',',      cls: 'key-op',            group: 'const' },
    { label: 'atan2', val: 'atan2(', cls: 'key-fn',            group: 'const' },
  ];

  // ── Criação do painel de aba ──────────────────────────────

  function createTabPanel(tab) {
    const panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.id        = `panel-${tab.id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tab-${tab.id}`);
    panel.dataset.tabId = tab.id;

    panel.innerHTML = `
      <div class="tab-panel-grid">
        <div class="col-left">
          <div class="result-card" id="result-card-${tab.id}">
            <div class="result-label">Resultado</div>
            <div class="result-value result-empty" id="result-value-${tab.id}">—</div>
            <div class="result-deps" id="result-deps-${tab.id}"></div>
          </div>
          <div class="deps-panel" id="deps-panel-${tab.id}">
            <div class="deps-panel-title">Valores usados</div>
            <div class="deps-grid" id="deps-grid-${tab.id}"></div>
          </div>
        </div>

        <div class="col-right">
          <div class="expr-container" id="expr-container-${tab.id}">
            <div class="expr-topbar">
              <span>Expressão</span>
              <div class="expr-mode-toggle">
                <button class="expr-mode-btn active" data-mode="auto"   data-tab="${tab.id}">Auto</button>
                <button class="expr-mode-btn"        data-mode="manual" data-tab="${tab.id}">Manual</button>
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
              <button class="btn-clear" id="btn-clear-${tab.id}">Limpar</button>
              <button class="btn-eval"  id="btn-eval-${tab.id}">= Calcular</button>
            </div>
          </div>

          <!-- Teclado virtual -->
          <div class="keypad-section" id="keypad-section-${tab.id}">

            <!-- Teclado base -->
            <div class="keypad keypad-base" id="keypad-${tab.id}">
              ${KEYPAD_BASE.map(k => `
                <button
                  class="key ${k.cls}"
                  data-val="${k.val}"
                  data-tab="${tab.id}"
                  aria-label="${k.title || k.label}"
                  ${k.val === 'NOOP' ? 'disabled' : ''}
                >${k.label}</button>
              `).join('')}
            </div>

            <!-- Teclado expandido (oculto por padrão) -->
            <div class="keypad-expanded" id="keypad-expanded-${tab.id}" aria-hidden="true">
              <div class="keypad-expanded-header">
                <span class="expanded-title">Funções</span>
                <button class="btn-expanded-close" data-tab="${tab.id}" aria-label="Fechar">✕</button>
              </div>
              <div class="keypad keypad-ext" id="keypad-ext-${tab.id}">
                ${KEYPAD_EXPANDED.map(k => `
                  <button
                    class="key ${k.cls}"
                    data-val="${k.val}"
                    data-tab="${tab.id}"
                    aria-label="${k.label}"
                    data-group="${k.group || ''}"
                  >${k.label}</button>
                `).join('')}
              </div>
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

  // ── Criação do item de aba ────────────────────────────────

  function createTabItem(tab, isActive) {
    const item = document.createElement('div');
    item.className = `tab-item${isActive ? ' active' : ''}`;
    item.id        = `tab-${tab.id}`;
    item.dataset.tabId = tab.id;
    item.setAttribute('role', 'tab');
    item.setAttribute('aria-selected', isActive ? 'true' : 'false');
    item.title = tab.name;
    item.innerHTML = `
      <span class="tab-dot"></span>
      <input class="tab-name-input" type="text" value="${_escape(tab.name)}"
        maxlength="20" aria-label="Nome da aba" readonly />
      <span class="tab-close" role="button" aria-label="Fechar aba" title="Fechar">✕</span>
    `;
    return item;
  }

  // ── Atualização de resultado ──────────────────────────────

  function updateResult(tabId, result, error, deps, depValues) {
    const card  = document.getElementById(`result-card-${tabId}`);
    const valEl = document.getElementById(`result-value-${tabId}`);
    const depsEl= document.getElementById(`result-deps-${tabId}`);
    const tabEl = document.getElementById(`tab-${tabId}`);
    if (!card || !valEl) return;

    card.classList.remove('updated', 'has-error');

    if (error) {
      valEl.className   = 'result-value result-error';
      valEl.textContent = error;
      card.classList.add('has-error');
      tabEl?.classList.add('has-error');
      depsEl.innerHTML  = '';
    } else if (result === null || result === undefined) {
      valEl.className   = 'result-value result-empty';
      valEl.textContent = '—';
      tabEl?.classList.remove('has-error');
      depsEl.innerHTML  = '';
    } else {
      valEl.className   = 'result-value';
      valEl.textContent = ENGINE.formatResult(result);
      tabEl?.classList.remove('has-error');
      depsEl.innerHTML  = deps.length
        ? deps.map(d => `<span class="dep-chip">${_escape(d)}</span>`).join('')
        : '';
    }

    void card.offsetWidth;
    card.classList.add('updated');
    updateDepsPanel(tabId, deps, depValues);
  }

  function updateDepsPanel(tabId, deps, depValues) {
    const panel = document.getElementById(`deps-panel-${tabId}`);
    const grid  = document.getElementById(`deps-grid-${tabId}`);
    if (!panel || !grid) return;

    if (!deps?.length) { panel.classList.remove('visible'); return; }
    panel.classList.add('visible');
    grid.innerHTML = deps.map(d => {
      const val = depValues?.[d];
      const display = (val !== null && val !== undefined) ? ENGINE.formatResult(val) : '?';
      return `<div class="dep-card" data-dep="${_escape(d)}" role="button" tabindex="0">
        <span class="dep-card-name">${_escape(d)}</span>
        <span class="dep-card-val">${display}</span>
      </div>`;
    }).join('');
  }

  // ── Histórico ─────────────────────────────────────────────

  function renderHistory(tabId, entries) {
    const list = document.getElementById(`history-list-${tabId}`);
    if (!list) return;
    if (!entries?.length) {
      list.innerHTML = '<div class="history-empty">Nenhuma entrada ainda</div>';
      return;
    }
    list.innerHTML = entries.map(e => `
      <div class="history-item" data-expr="${_escape(e.expr)}" role="button" tabindex="0">
        <span class="history-expr">${_escape(e.expr)}</span>
        <span class="history-result">${_escape(String(e.result ?? e.error ?? ''))}</span>
        <span class="history-ts">${_fmtTime(e.ts)}</span>
      </div>
    `).join('');
  }

  // ── Keypad show/hide/toggle ───────────────────────────────

  function showKeypad(tabId) {
    document.getElementById(`keypad-section-${tabId}`)?.classList.add('visible');
  }
  function hideKeypad(tabId) {
    document.getElementById(`keypad-section-${tabId}`)?.classList.remove('visible');
  }
  function toggleKeypad(tabId) {
    document.getElementById(`keypad-section-${tabId}`)?.classList.toggle('visible');
  }

  // Expanded keypad
  function showExpandedKeypad(tabId) {
    const el = document.getElementById(`keypad-expanded-${tabId}`);
    if (el) { el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); }
    // Mark expand button as active
    const btn = document.querySelector(`#keypad-${tabId} [data-val="EXPAND"]`);
    btn?.classList.add('active');
  }
  function hideExpandedKeypad(tabId) {
    const el = document.getElementById(`keypad-expanded-${tabId}`);
    if (el) { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }
    const btn = document.querySelector(`#keypad-${tabId} [data-val="EXPAND"]`);
    btn?.classList.remove('active');
  }
  function toggleExpandedKeypad(tabId) {
    const el = document.getElementById(`keypad-expanded-${tabId}`);
    if (el?.classList.contains('open')) hideExpandedKeypad(tabId);
    else showExpandedKeypad(tabId);
  }

  // Lock state visual
  function setKeyboardLock(tabId, locked) {
    const lockBtn = document.querySelector(`#keypad-${tabId} [data-val="LOCK"]`);
    if (lockBtn) {
      lockBtn.textContent = locked ? '🔓' : '🔒';
      lockBtn.classList.toggle('active', locked);
      lockBtn.title = locked ? 'Desbloquear teclado nativo' : 'Travar teclado nativo';
    }
  }

  // ── Toast ─────────────────────────────────────────────────

  function toast(msg, type = 'info', duration = 2800) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className   = `toast toast-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => {
      t.classList.add('toast-out');
      setTimeout(() => t.remove(), 250);
    }, duration);
  }

  // ── Autocomplete ──────────────────────────────────────────

  let _acVisible = false, _acItems = [], _acIndex = -1, _onAcSelect = null;

  function showAutocomplete(anchorEl, items, onSelect) {
    const dd = document.getElementById('autocomplete-dropdown');
    if (!dd || !items.length) { hideAutocomplete(); return; }
    _acItems = items; _acIndex = -1; _onAcSelect = onSelect;
    dd.innerHTML = items.map((item, i) => `
      <div class="ac-item" data-index="${i}" role="option">
        <span class="ac-item-type ${item.type}">${item.type === 'tab' ? 'aba' : 'fn'}</span>
        <span>${_escape(item.label)}</span>
        ${item.value !== undefined ? `<span class="ac-item-val">${_escape(String(item.value))}</span>` : ''}
      </div>
    `).join('');
    const rect = anchorEl.getBoundingClientRect();
    dd.style.left  = `${rect.left}px`;
    dd.style.top   = `${rect.bottom + 4}px`;
    dd.style.width = `${Math.max(200, rect.width)}px`;
    dd.classList.add('open');
    _acVisible = true;
  }

  function hideAutocomplete() {
    document.getElementById('autocomplete-dropdown')?.classList.remove('open');
    _acVisible = false; _acIndex = -1;
  }

  function acNavigate(dir) {
    if (!_acVisible) return false;
    const items = document.getElementById('autocomplete-dropdown')?.querySelectorAll('.ac-item');
    if (!items?.length) return false;
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

  // ── Helpers ───────────────────────────────────────────────

  function _escape(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _fmtTime(ts) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  // ── Global lock visual ───────────────────────────────────

  function setGlobalLockVisual(locked) {
    const btn = document.getElementById('btn-global-lock');
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(locked));
    btn.classList.toggle('active', locked);
    btn.querySelector('.lock-icon-open').style.display  = locked ? 'none' : '';
    btn.querySelector('.lock-icon-closed').style.display = locked ? '' : 'none';
    btn.title = locked ? 'Destavar teclado (todas as abas)' : 'Travar teclado (todas as abas)';
  }

  // ── Tab Select Popup ──────────────────────────────────────

  /**
   * Exibe um popup inline com lista de abas para inserir referência.
   * anchorEl: botão que disparou; tabs: [{ id, name, result }]; onSelect: fn(name)
   */
  function showTabSelectPopup(anchorEl, tabList, currentTabId, onSelect) {
    // Remove popup anterior se existir
    document.getElementById('tab-select-popup')?.remove();

    const popup = document.createElement('div');
    popup.id = 'tab-select-popup';
    popup.className = 'tab-select-popup';
    popup.setAttribute('role', 'listbox');
    popup.setAttribute('aria-label', 'Selecionar aba');

    const others = tabList.filter(t => t.id !== currentTabId);
    if (!others.length) {
      popup.innerHTML = '<div class="tab-select-empty">Nenhuma outra aba</div>';
    } else {
      popup.innerHTML = others.map(t => {
        const val = (t.result !== null && t.result !== undefined)
          ? ENGINE.formatResult(t.result) : (t.error ? '⚠' : '—');
        return `<button class="tab-select-item" data-name="${_escape(t.name)}" role="option">
          <span class="tab-select-name">${_escape(t.name)}</span>
          <span class="tab-select-val">${_escape(String(val))}</span>
        </button>`;
      }).join('');
    }

    // Position below anchor
    document.body.appendChild(popup);
    const rect = anchorEl.getBoundingClientRect();
    const popW = 180;
    let left = rect.left + rect.width / 2 - popW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - popW - 8));
    popup.style.left   = `${left}px`;
    popup.style.top    = `${rect.top - popup.offsetHeight - 6}px`;
    // Re-position after paint so height is known
    requestAnimationFrame(() => {
      popup.style.top = `${rect.top - popup.offsetHeight - 6}px`;
    });

    popup.querySelectorAll('.tab-select-item').forEach(btn => {
      btn.addEventListener('click', () => {
        onSelect(btn.dataset.name);
        popup.remove();
      });
    });

    // Close on outside click
    const dismiss = (e) => {
      if (!popup.contains(e.target) && e.target !== anchorEl) {
        popup.remove();
        document.removeEventListener('click', dismiss, true);
      }
    };
    setTimeout(() => document.addEventListener('click', dismiss, true), 0);
  }

  function hideTabSelectPopup() {
    document.getElementById('tab-select-popup')?.remove();
  }

  return {
    createTabPanel, createTabItem,
    updateResult, updateDepsPanel, renderHistory,
    showKeypad, hideKeypad, toggleKeypad,
    showExpandedKeypad, hideExpandedKeypad, toggleExpandedKeypad,
    setKeyboardLock, setGlobalLockVisual,
    showTabSelectPopup, hideTabSelectPopup,
    toast,
    showAutocomplete, hideAutocomplete, acNavigate, acConfirm, isAcVisible,
    KEYPAD_BASE, KEYPAD_EXPANDED,
  };
})();

window.UI = UI;
