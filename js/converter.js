/**
 * converter.js — Módulo de conversão de unidades do CalcFlow
 *
 * Categorias built-in: Área, Comprimento, Temperatura, Volume,
 *   Massa, Dados, Velocidade, Tempo
 * Conversões personalizadas: base-factor, salvas em IndexedDB via DB.saveCustomConv
 *
 * Todas as conversões usam uma unidade base intermediária:
 *   from → base → to
 * Temperatura usa funções de offset (não é escalonamento linear puro).
 */

const CONVERTER = (() => {
  'use strict';

  // ── Definições built-in ───────────────────────────────────

  /**
   * Cada categoria tem:
   *   units: [{ id, label, toBase, fromBase }]
   *   toBase / fromBase podem ser number (fator) ou function(x)
   */
  const CATEGORIES = [
    {
      id: 'length', label: 'Comprimento', icon: '📏',
      units: [
        { id: 'mm',  label: 'Milímetro (mm)',  toBase: 0.001,    fromBase: 1000 },
        { id: 'cm',  label: 'Centímetro (cm)', toBase: 0.01,     fromBase: 100 },
        { id: 'm',   label: 'Metro (m)',        toBase: 1,        fromBase: 1 },
        { id: 'km',  label: 'Quilômetro (km)', toBase: 1000,     fromBase: 0.001 },
        { id: 'in',  label: 'Polegada (in)',    toBase: 0.0254,   fromBase: 1/0.0254 },
        { id: 'ft',  label: 'Pé (ft)',          toBase: 0.3048,   fromBase: 1/0.3048 },
        { id: 'yd',  label: 'Jarda (yd)',       toBase: 0.9144,   fromBase: 1/0.9144 },
        { id: 'mi',  label: 'Milha (mi)',       toBase: 1609.344, fromBase: 1/1609.344 },
        { id: 'nmi', label: 'Milha náut. (nmi)',toBase: 1852,     fromBase: 1/1852 },
      ],
    },
    {
      id: 'area', label: 'Área', icon: '▭',
      units: [
        { id: 'mm2', label: 'mm²',      toBase: 1e-6,      fromBase: 1e6 },
        { id: 'cm2', label: 'cm²',      toBase: 1e-4,      fromBase: 1e4 },
        { id: 'm2',  label: 'm²',       toBase: 1,         fromBase: 1 },
        { id: 'km2', label: 'km²',      toBase: 1e6,       fromBase: 1e-6 },
        { id: 'ha',  label: 'Hectare',  toBase: 1e4,       fromBase: 1e-4 },
        { id: 'in2', label: 'in²',      toBase: 6.4516e-4, fromBase: 1/6.4516e-4 },
        { id: 'ft2', label: 'ft²',      toBase: 0.092903,  fromBase: 1/0.092903 },
        { id: 'ac',  label: 'Acre',     toBase: 4046.856,  fromBase: 1/4046.856 },
      ],
    },
    {
      id: 'volume', label: 'Volume', icon: '🧊',
      units: [
        { id: 'ml',  label: 'Mililitro (ml)',  toBase: 1e-6,     fromBase: 1e6 },
        { id: 'l',   label: 'Litro (L)',        toBase: 0.001,    fromBase: 1000 },
        { id: 'm3',  label: 'm³',               toBase: 1,        fromBase: 1 },
        { id: 'cm3', label: 'cm³',              toBase: 1e-6,     fromBase: 1e6 },
        { id: 'gal', label: 'Galão US (gal)',   toBase: 0.003785, fromBase: 1/0.003785 },
        { id: 'qt',  label: 'Quart US (qt)',    toBase: 9.464e-4, fromBase: 1/9.464e-4 },
        { id: 'pt',  label: 'Pint US (pt)',     toBase: 4.732e-4, fromBase: 1/4.732e-4 },
        { id: 'floz',label: 'fl oz US',         toBase: 2.957e-5, fromBase: 1/2.957e-5 },
        { id: 'tsp', label: 'Colher chá',       toBase: 4.929e-6, fromBase: 1/4.929e-6 },
        { id: 'tbsp',label: 'Colher sopa',      toBase: 1.479e-5, fromBase: 1/1.479e-5 },
      ],
    },
    {
      id: 'mass', label: 'Massa', icon: '⚖️',
      units: [
        { id: 'mg',  label: 'Miligrama (mg)',  toBase: 1e-6,    fromBase: 1e6 },
        { id: 'g',   label: 'Grama (g)',        toBase: 0.001,   fromBase: 1000 },
        { id: 'kg',  label: 'Quilograma (kg)', toBase: 1,       fromBase: 1 },
        { id: 't',   label: 'Tonelada (t)',     toBase: 1000,    fromBase: 0.001 },
        { id: 'oz',  label: 'Onça (oz)',        toBase: 0.02835, fromBase: 1/0.02835 },
        { id: 'lb',  label: 'Libra (lb)',       toBase: 0.45359, fromBase: 1/0.45359 },
        { id: 'st',  label: 'Stone (st)',       toBase: 6.35029, fromBase: 1/6.35029 },
      ],
    },
    {
      id: 'temp', label: 'Temperatura', icon: '🌡️',
      units: [
        {
          id: 'c', label: 'Celsius (°C)',
          toBase:   x => x,          // base = Celsius
          fromBase: x => x,
        },
        {
          id: 'f', label: 'Fahrenheit (°F)',
          toBase:   x => (x - 32) * 5/9,
          fromBase: x => x * 9/5 + 32,
        },
        {
          id: 'k', label: 'Kelvin (K)',
          toBase:   x => x - 273.15,
          fromBase: x => x + 273.15,
        },
        {
          id: 'r', label: 'Rankine (°R)',
          toBase:   x => (x - 491.67) * 5/9,
          fromBase: x => x * 9/5 + 491.67,
        },
      ],
    },
    {
      id: 'speed', label: 'Velocidade', icon: '🚀',
      units: [
        { id: 'ms',   label: 'm/s',       toBase: 1,       fromBase: 1 },
        { id: 'kmh',  label: 'km/h',      toBase: 1/3.6,   fromBase: 3.6 },
        { id: 'mph',  label: 'mph',       toBase: 0.44704, fromBase: 1/0.44704 },
        { id: 'kn',   label: 'Nó (kn)',   toBase: 0.51444, fromBase: 1/0.51444 },
        { id: 'mach', label: 'Mach',      toBase: 340.29,  fromBase: 1/340.29 },
        { id: 'c_l',  label: 'Vel. luz',  toBase: 299792458, fromBase: 1/299792458 },
      ],
    },
    {
      id: 'time', label: 'Tempo', icon: '⏱️',
      units: [
        { id: 'ns',  label: 'Nanosseg (ns)', toBase: 1e-9,   fromBase: 1e9 },
        { id: 'us',  label: 'Microsseg (µs)',toBase: 1e-6,   fromBase: 1e6 },
        { id: 'ms_t',label: 'Milisseg (ms)', toBase: 0.001,  fromBase: 1000 },
        { id: 's',   label: 'Segundo (s)',   toBase: 1,      fromBase: 1 },
        { id: 'min', label: 'Minuto (min)',  toBase: 60,     fromBase: 1/60 },
        { id: 'h',   label: 'Hora (h)',      toBase: 3600,   fromBase: 1/3600 },
        { id: 'd',   label: 'Dia (d)',       toBase: 86400,  fromBase: 1/86400 },
        { id: 'wk',  label: 'Semana',        toBase: 604800, fromBase: 1/604800 },
        { id: 'mo',  label: 'Mês (30d)',     toBase: 2592000,fromBase: 1/2592000 },
        { id: 'yr',  label: 'Ano (365d)',    toBase: 31536000,fromBase:1/31536000},
      ],
    },
    {
      id: 'data', label: 'Dados', icon: '💾',
      units: [
        { id: 'bit',  label: 'Bit',       toBase: 1,         fromBase: 1 },
        { id: 'byte', label: 'Byte',      toBase: 8,         fromBase: 1/8 },
        { id: 'kb',   label: 'Kilobyte',  toBase: 8*1024,    fromBase: 1/(8*1024) },
        { id: 'mb',   label: 'Megabyte',  toBase: 8*1048576, fromBase: 1/(8*1048576) },
        { id: 'gb',   label: 'Gigabyte',  toBase: 8*1073741824, fromBase:1/(8*1073741824) },
        { id: 'tb',   label: 'Terabyte',  toBase: 8*1099511627776, fromBase:1/(8*1099511627776) },
        { id: 'kbps', label: 'Kbps',      toBase: 1000,      fromBase: 0.001 },
        { id: 'mbps', label: 'Mbps',      toBase: 1e6,       fromBase: 1e-6 },
        { id: 'gbps', label: 'Gbps',      toBase: 1e9,       fromBase: 1e-9 },
      ],
    },
  ];

  // ── Conversão personalizada (DB) ──────────────────────────

  // Carregadas do IndexedDB; formato: [{ id, name, units:[{id,label,factor}] }]
  let _customCategories = [];

  async function loadCustom() {
    try {
      const all = await DB.getAllCustomConv();
      _customCategories = all || [];
    } catch { _customCategories = []; }
  }

  async function saveCustomCategory(cat) {
    await DB.saveCustomConv(cat);
    await loadCustom();
  }

  async function deleteCustomCategory(id) {
    await DB.deleteCustomConv(id);
    await loadCustom();
  }

  // ── API de conversão ──────────────────────────────────────

  /**
   * Converte `value` de `fromId` para `toId` dentro de `categoryId`.
   * Suporta categorias built-in e personalizadas.
   * @returns {number|null}
   */
  function convert(categoryId, fromId, toId, value) {
    if (!isFinite(value)) return null;

    // Categoria built-in
    const cat = CATEGORIES.find(c => c.id === categoryId);
    if (cat) {
      const from = cat.units.find(u => u.id === fromId);
      const to   = cat.units.find(u => u.id === toId);
      if (!from || !to) return null;
      const toBaseF   = typeof from.toBase   === 'function' ? from.toBase   : (x => x * from.toBase);
      const fromBaseF = typeof to.fromBase   === 'function' ? to.fromBase   : (x => x * to.fromBase);
      const base = toBaseF(value);
      return fromBaseF(base);
    }

    // Categoria personalizada — todos os fatores são relativos à unidade base (index 0)
    const cust = _customCategories.find(c => c.id === categoryId);
    if (cust) {
      const from = cust.units.find(u => u.id === fromId);
      const to   = cust.units.find(u => u.id === toId);
      if (!from || !to) return null;
      // Converte para base (÷ fator from) depois para destino (× fator to)
      const inBase = value / from.factor;
      return inBase * to.factor;
    }

    return null;
  }

  function getAllCategories() {
    return [
      ...CATEGORIES.map(c => ({ ...c, custom: false })),
      ..._customCategories.map(c => ({ ...c, custom: true })),
    ];
  }

  function getCategoryById(id) {
    return CATEGORIES.find(c => c.id === id)
      || _customCategories.find(c => c.id === id)
      || null;
  }

  function getCustomCategories() { return _customCategories; }

  return {
    loadCustom,
    saveCustomCategory,
    deleteCustomCategory,
    convert,
    getAllCategories,
    getCategoryById,
    getCustomCategories,
  };
})();

window.CONVERTER = CONVERTER;
