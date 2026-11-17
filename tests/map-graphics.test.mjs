import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('assets/graphics-tools.js', root), 'utf8');
const html = await readFile(new URL('index.html', root), 'utf8');
const india = JSON.parse(gunzipSync(await readFile(new URL('assets/india-map.json.gz', root))));
const districts = JSON.parse(await readFile(new URL('assets/india-districts-display.geojson', root), 'utf8'));
const karnatakaDistricts = JSON.parse(await readFile(new URL('assets/karnataka-districts-display.geojson', root), 'utf8'));
const districtCount = districts.features.filter(feature => feature.properties.state.toLowerCase() !== 'karnataka').length + karnatakaDistricts.features.length;
const decode = value => value.replace(/&amp;/g, '&').replace(/&#10;/g, '\n').replace(/&quot;/g, '"');
const attribute = (tag, name) => tag.match(new RegExp('(?:^|\\s)' + name + '="([^"]*)"'))?.[1];
const bounds = points => points.length ? [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))] : null;
const intersect = (a, b) => !a ? b : !b ? a : [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
const visible = box => !box || (box[2] > box[0] && box[3] > box[1]);

// Record clipping as well as drawing calls: a canvas can draw the right shapes
// while a leaked clip makes an entire comparison panel invisible.
class MockPath {
  constructor() { this.points = []; }
  moveTo(x, y) { this.points.push([x, y]); }
  lineTo(x, y) { this.points.push([x, y]); }
  closePath() {}
}

function canvasContext() {
  const context = {
    records: [], stack: [], clipBox: null, currentPath: [], fillStyle: '#000000',
    reset() { this.records = []; this.stack = []; this.clipBox = null; this.currentPath = []; },
    save() { this.stack.push({clipBox:this.clipBox, fillStyle:this.fillStyle, font:this.font, textAlign:this.textAlign}); },
    restore() { Object.assign(this, this.stack.pop() || {}); },
    beginPath() { this.currentPath = []; },
    rect(x, y, w, h) { this.currentPath.push([x, y], [x + w, y + h]); },
    roundRect(x, y, w, h) { this.rect(x, y, w, h); },
    moveTo(x, y) { this.currentPath.push([x, y]); },
    lineTo(x, y) { this.currentPath.push([x, y]); },
    arc(x, y, r) { this.currentPath.push([x - r, y - r], [x + r, y + r]); },
    clip(path) { this.clipBox = intersect(this.clipBox, bounds(path instanceof MockPath ? path.points : this.currentPath)); },
    record(kind, box, extra = {}) { this.records.push({kind, box, fill:this.fillStyle, visible:visible(intersect(this.clipBox, box)), ...extra}); },
    fill(path) { this.record(path instanceof MockPath ? 'polygon' : 'fill', bounds(path instanceof MockPath ? path.points : this.currentPath)); },
    fillRect(x, y, w, h) { this.record('rect', [x, y, x + w, y + h]); },
    fillText(value, x, y) { this.record('text', [x, y - 12, x + String(value).length * 9, y], {text:String(value), x, y, font:this.font}); },
    measureText(value) { return {width:String(value).length * 12}; },
    createLinearGradient() { return {addColorStop() {}}; },
    isPointInPath(path, x, y) { const b = bounds(path.points); return !!b && x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]; },
    closePath() {}, stroke() {}, strokeRect() {}, drawImage() {}, translate() {}, scale() {},
  };
  return context;
}

class Element {
  constructor(id, tagName = 'DIV') {
    Object.assign(this, {id, tagName, value:'', type:'', hidden:false, disabled:false, checked:false, dataset:{}, options:[], listeners:new Map(), attributes:{}, width:1080, _height:1350, capture:null});
  }
  addEventListener(type, callback) { const list = this.listeners.get(type) || []; list.push(callback); this.listeners.set(type, list); }
  emit(type, properties = {}) { for (const callback of this.listeners.get(type) || []) callback({target:this, preventDefault() {}, ...properties}); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  querySelector(selector) { this.children ||= new Map(); if (!this.children.has(selector)) this.children.set(selector, new Element(selector)); return this.children.get(selector); }
  replaceChildren(...children) { this.options = children; this.value = children[0]?.value || ''; }
  get selectedIndex() { return this.options.findIndex(option => option.value === this.value); }
  getContext() { return this.context ||= canvasContext(); }
  get height() { return this._height; }
  set height(value) { this._height = value; this.context?.reset(); }
  getBoundingClientRect() { return {left:0, top:0, width:this.width, height:this.height}; }
  setPointerCapture(id) { this.capture = id; }
  hasPointerCapture(id) { return this.capture === id; }
  releasePointerCapture() { this.capture = null; }
}

async function studio(initial = {}, {hidden = false, saved = [], widgets = false} = {}) {
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id); };
  for (const match of html.matchAll(/<(input|select|textarea|canvas|div|button|output|p|section|label)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const [, tag, attrs, id] = match;
    const element = get(id);
    element.tagName = tag.toUpperCase();
    element.hidden = /(?:^|\s)hidden(?:\s|$)/.test(attrs);
    element.checked = /(?:^|\s)checked(?:\s|$)/.test(attrs);
    element.type = attribute(attrs, 'type') || '';
    element.value = decode(attribute(attrs, 'value') || '');
    if (tag === 'textarea' || tag === 'select') {
      const body = html.slice(match.index + match[0].length).split('</' + tag + '>')[0];
      if (tag === 'textarea') element.value = decode(body);
      else {
        element.options = [...body.matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)].map(([, optionAttrs, label]) => ({value:attribute(optionAttrs, 'value') || decode(label), textContent:decode(label), dataset:{}}));
        element.value = element.options[0]?.value || '';
      }
    }
  }
  Object.assign(get('mapGraphicsLab'), {hidden});
  for (const [id, value] of Object.entries(initial)) {
    if (typeof value === 'boolean') get(id).checked = value;
    else get(id).value = value;
  }
  const store = new Map(saved);
  const requests = [];
  const errors = [];
  let pending = 0;
  const nudges = ['left', 'right', 'up', 'down'].map(direction => { const e = new Element('nudge-' + direction); e.dataset.mapNudge = direction; return e; });
  const documentEvents = new Element('document');
  const sandbox = {
    document:{getElementById:get, createElement:tag => new Element('', tag.toUpperCase()), querySelectorAll:() => nudges, fonts:{ready:Promise.resolve()}, readyState:'loading', addEventListener:(type, callback) => documentEvents.addEventListener(type, callback), dispatchEvent:event => { documentEvents.emit(event.type, event); return true; }},
    AVI_INDIA_MAP:india, Path2D:MockPath,
    CustomEvent:class { constructor(type, properties = {}) { this.type = type; Object.assign(this, properties); } },
    Option:function(label, value) { return {textContent:label, value, dataset:{}}; },
    lsGet:key => store.get(key) ?? null, lsSet:(key, value) => store.set(key, value),
    localStorage:{getItem:key => store.get(key) ?? null, setItem:(key, value) => store.set(key, value)},
    console:{error:(...args) => errors.push(args)},
    fetch:async url => {
      requests.push(url); pending++;
      try {
        const bytes = await readFile(new URL(url, root));
        return {ok:true, json:async () => JSON.parse(bytes.toString()), arrayBuffer:async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)};
      } finally { pending--; }
    },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  if (widgets) runInNewContext(await readFile(new URL('assets/map-widgets.js', root), 'utf8'), sandbox, {filename:'map-widgets.js'});
  runInNewContext(source, sandbox, {filename:'graphics-tools.js'});
  const settle = async () => {
    for (let turn = 0; turn < 1000; turn++) {
      await new Promise(resolve => setTimeout(resolve, 5));
      if (!pending) { await new Promise(resolve => setImmediate(resolve)); break; }
    }
    assert.deepEqual(errors, [], 'map rendering must complete without errors');
  };
  await settle();
  return {get, store, requests, settle, widgets:sandbox.AviMapWidgets, records:() => get('mapCanvas').getContext('2d').records, set:(id, value, type = 'input') => { if (typeof value === 'boolean') get(id).checked = value; else get(id).value = value; get(id).emit(type); }, nudge:direction => nudges.find(e => e.dataset.mapNudge === direction).emit('click')};
}

test('loads the initial geography even when the map tab starts hidden', async () => {
  const app = await studio({mapRegion:'indiaDistricts'}, {hidden:true});
  assert.ok(app.requests.includes('./assets/india-districts-display.geojson'));
  assert.match(app.get('mapStatus').textContent, new RegExp(String(districtCount)));
  assert.equal(app.get('mapDownload').disabled, false);
});

test('Karnataka replaces the old layer with all 31 supplied districts and accepts common aliases', async () => {
  const app = await studio({mapRegion:'indiaDistricts', mapScope:'karnataka', mapLayout:'atlas', mapPins:'', mapValues:''});
  assert.ok(app.requests.includes('./assets/karnataka-districts-display.geojson'));
  assert.equal(app.get('mapFeaturePick').options.filter(option => option.value).length, 31);
  assert.ok(app.get('mapFeaturePick').options.some(option => option.value === '738' && option.textContent === 'Vijayanagara'));
  assert.ok(app.get('mapEditPlace').options.some(option => option.value === '631' && option.textContent === 'Bengaluru South'));
  app.set('mapBulkData', 'Ramanagara | BJP\nBangalore Urban | INC\nBangalore Rural | JDS\nGulbarga | BJP\nDavangere | INC\nBellary | JDS\nBijapur | BJP\nShimoga | INC\nVijayanagar | JDS\nKolar | BJP');
  app.get('mapBulkApply').emit('click');
  assert.match(app.get('mapBulkStatus').textContent, /10 map marks applied/);
  assert.doesNotMatch(app.get('mapBulkStatus').textContent, /skipped/);
  for (const id of ['631', '525', '526', '538', '535', '528', '530', '547', '738', '542']) assert.ok(app.get('mapValues').value.split('\n').some(line => line.startsWith(id + ' | ')), id + ' must resolve through its alias');
});

test('state values render highlighted states and their story cards', async () => {
  const app = await studio({mapRegion:'indiaStates', mapStateValues:'Karnataka | 42 | State story', mapLayout:'briefing', mapPins:''});
  assert.ok(app.records().some(record => record.kind === 'text' && record.text === '42'));
  assert.ok(app.records().some(record => record.kind === 'text' && record.text === 'Karnataka'));
  assert.ok(app.records().some(record => record.kind === 'text' && record.text === 'State story'));
  app.get('mapStateHighlight').emit('click');
  assert.ok(!app.get('mapStateValues').value.includes('Karnataka'), 'toggle removes the selected state');
});

test('bulk paste marks scoped Assembly names that also exist in another state', async () => {
  const app = await studio({mapRegion:'indiaAC', mapScope:'karnataka', mapPins:'', mapValues:''});
  app.set('mapBulkData', 'Khanapur | BJP | Border seat\nShivajinagar | INC | Urban seat\nSagar | 42 | Numeric value');
  app.get('mapBulkApply').emit('click');
  assert.match(app.get('mapBulkStatus').textContent, /3/);
  for (const name of ['Khanapur', 'Shivajinagar', 'Sagar']) {
    assert.ok(app.records().some(record => record.kind === 'text' && record.text.startsWith(name)), name + ' must be marked within Karnataka');
  }
  assert.ok(app.records().some(record => record.kind === 'polygon' && record.fill === '#f47a21'));
  assert.ok(app.records().some(record => record.kind === 'polygon' && record.fill === '#2675d8'));
});

test('screenshot-style district rows honour spaced hyphens and their explicit colours', async () => {
  const app = await studio({mapRegion:'indiaDistricts', mapScope:'karnataka', mapLayout:'atlas', mapPins:'', mapValues:'', mapLabelMode:'marked'});
  app.set('mapBulkData', 'Koppal - BJP - Orange\nRaichur - CONG - BLUE\nShivamogga - JDS - GREEN');
  app.get('mapBulkApply').emit('click');
  assert.match(app.get('mapBulkStatus').textContent, /3 map marks applied/);
  assert.doesNotMatch(app.get('mapBulkStatus').textContent, /skipped|No rows/);
  for (const [id, party] of [['543', 'BJP'], ['546', 'CONG'], ['547', 'JDS']]) {
    assert.ok(app.get('mapValues').value.includes(id + ' | ' + party), 'bulk input must retain the party value for ' + id);
  }
  for (const fill of ['#f47a21', '#2675d8', '#20a56b']) assert.ok(app.records().some(record => record.kind === 'polygon' && record.fill === fill && record.visible), fill + ' must colour a district');
  for (const label of ['Koppal', 'Raichur', 'Shivamogga']) assert.ok(app.records().some(record => record.kind === 'text' && record.text === label && record.visible), label + ' must be labelled');
});

test('a spreadsheet colour column overrides party colour and keeps quoted notes', async () => {
  const app = await studio({mapRegion:'indiaDistricts', mapScope:'karnataka', mapLayout:'briefing', mapPins:'', mapValues:''});
  app.set('mapBulkData', 'District,Party,Color,Note\nKoppal,BJP,#123456,"Custom, party colour"\nRaichur,CONG,Orange,Party override\nShivamogga,JDS,BLUE,Another override');
  app.get('mapBulkApply').emit('click');
  assert.match(app.get('mapBulkStatus').textContent, /3 map marks applied/);
  for (const fill of ['#123456', '#f47a21', '#2675d8']) assert.ok(app.records().some(record => record.kind === 'polygon' && record.fill === fill), fill + ' must override the party palette');
  const rendered = app.records().filter(record => record.kind === 'text').map(record => record.text).join(' ');
  assert.ok(rendered.includes('Custom, party colour'), 'a quoted CSV note stays in the story card');
});

test('place labels can be edited, hidden globally or individually, and restored from saved settings', async () => {
  const app = await studio({mapRegion:'indiaDistricts', mapScope:'karnataka', mapLayout:'atlas', mapPins:'', mapValues:'543 | BJP', mapLabelMode:'marked', mapLabelSize:'23'});
  const labels = () => app.records().filter(record => record.kind === 'text');
  assert.ok(labels().some(record => record.text === 'Koppal'));
  app.set('mapEditPlace', '543', 'change');
  app.set('mapEditLabel', 'Koppal story label');
  app.set('mapEditValue', 'BJP');
  app.set('mapEditNote', 'Edited place note');
  app.set('mapEditColor', '#123456');
  app.set('mapEditVisible', true);
  app.get('mapSavePlace').emit('click');
  assert.ok(labels().some(record => record.text === 'Koppal story label'));
  assert.ok(!labels().some(record => record.text === 'Koppal'), 'custom label replaces the default place label');
  assert.ok(app.records().some(record => record.kind === 'polygon' && record.fill === '#123456'));
  app.set('mapLabelSize', '34');
  assert.match(labels().find(record => record.text === 'Koppal story label').font, /34px/);
  app.set('mapLabelMode', 'off');
  assert.ok(!labels().some(record => record.text === 'Koppal story label'), 'global off hides marked-place labels');
  app.set('mapLabelMode', 'all');
  assert.ok(labels().some(record => record.text === 'Koppal story label'));
  assert.ok(labels().some(record => ['Raichur', 'Shivamogga', 'Belagavi', 'Udupi'].includes(record.text)), 'all mode also labels unmarked districts');
  app.set('mapEditVisible', false);
  app.get('mapSavePlace').emit('click');
  assert.ok(!labels().some(record => record.text === 'Koppal story label'), 'individual hidden label stays hidden in all mode');
  assert.ok(app.records().some(record => record.kind === 'polygon' && record.fill === '#123456'), 'hiding a label retains its map colour');
  const restored = await studio({}, {saved:app.store});
  assert.equal(restored.get('mapLabelMode').value, 'all');
  assert.ok(!restored.records().some(record => record.kind === 'text' && record.text === 'Koppal story label'));
  assert.ok(restored.records().some(record => record.kind === 'polygon' && record.fill === '#123456'));
});

test('white design paints a pure white publication canvas', async () => {
  const app = await studio({mapRegion:'indiaDistricts', mapScope:'karnataka', mapLayout:'atlas', mapDesign:'white', mapUseCustomColors:false, mapPins:'', mapValues:'543 | BJP'});
  const background = () => app.records().find(record => record.kind === 'rect' && record.box[0] === 0 && record.box[1] === 0 && record.box[2] === 1080 && record.box[3] === app.get('mapCanvas').height);
  assert.ok(background(), 'the full canvas must be painted');
  assert.equal(background().fill, '#ffffff');
  app.set('mapDesign', 'signal', 'change');
  app.set('mapBackgroundColor', '#ffffff');
  app.set('mapUseCustomColors', true);
  assert.equal(background().fill, '#ffffff', 'the custom background control paints the exported canvas white');
  app.set('mapBackgroundColor', '#fdfdfd');
  assert.equal(background().fill, '#fdfdfd');
  app.set('mapDesign', 'white', 'change');
  assert.equal(app.get('mapUseCustomColors').checked, false, 'choosing a design clears a stale custom override');
  assert.equal(background().fill, '#ffffff');
});

test('all nine story compositions have distinct map or annotation geometry', async () => {
  const app = await studio({mapRegion:'indiaDistricts', mapScope:'karnataka', mapLayout:'atlas', mapPins:'', mapValues:'543 | BJP | District story\n546 | INC | Second district\n547 | JDS | Third district', mapComparisonData:'Koppal | BJP | INC\nRaichur | INC | BJP\nShivamogga | JDS | JDS', mapLabelMode:'off'});
  const signatures = new Map();
  for (const layout of ['atlas', 'callouts', 'dashboard', 'election', 'seats', 'pinboard', 'spotlight', 'briefing', 'comparison']) {
    app.set('mapLayout', layout);
    const records = app.records();
    assert.ok(records.some(record => record.kind === 'polygon' && record.visible), layout + ' must keep its map visible');
    // Text-only title changes do not count as a new composition: the map,
    // cards, numbered pins or statistical marks must actually change shape.
    const signature = JSON.stringify(records.filter(record => record.kind !== 'text' && record.visible).map(record => [record.kind, record.fill, record.box?.map(value => Math.round(value))]));
    assert.ok(!signatures.has(signature), layout + ' repeats the geometry of ' + signatures.get(signature));
    signatures.set(signature, layout);
  }
  assert.equal(signatures.size, 9);
});

test('comparison draws visible before and after maps outside each other\'s clip', async () => {
  const app = await studio({mapRegion:'indiaAC', mapScope:'karnataka', mapLayout:'comparison', mapComparisonData:'Khanapur | BJP | INC', mapPins:'', mapValues:''});
  app.get('mapComparisonApply').emit('click');
  const records = app.records();
  assert.ok(records.some(record => record.kind === 'polygon' && record.fill === '#f47a21' && record.visible && record.box[2] < 550), 'before party colour must be visible in the left map');
  assert.ok(records.some(record => record.kind === 'polygon' && record.fill === '#2675d8' && record.visible && record.box[0] > 550), 'after party colour must be visible in the right map');
  for (const text of ['BEFORE', 'AFTER']) assert.ok(records.some(record => record.kind === 'text' && record.text === text && record.visible), text + ' heading must be visible');
});

test('spreadsheet paste supports states, quoted CSV notes and shared numeric comparison colours', async () => {
  const app = await studio({mapRegion:'indiaStates', mapLayout:'briefing', mapPins:'', mapStateValues:''});
  app.set('mapBulkData', 'State,Party,Note\nKarnataka,BJP,"State story, with context"\nMaharashtra,INC,Second story');
  app.get('mapBulkApply').emit('click');
  assert.match(app.get('mapBulkStatus').textContent, /2/);
  assert.ok(app.records().filter(record => record.kind === 'text').map(record => record.text).join(' ').includes('State story, with context'));
  for (const fill of ['#f47a21', '#2675d8']) assert.ok(app.records().some(record => record.kind === 'polygon' && record.fill === fill));
  app.set('mapLayout', 'comparison');
  app.set('mapComparisonData', 'State\tBefore\tAfter\nKarnataka\t10\t20\nMaharashtra\t20\t40');
  app.get('mapComparisonApply').emit('click');
  const colours = side => {
    const counts = new Map();
    for (const record of app.records().filter(record => record.kind === 'polygon' && record.visible && (side === 'before' ? record.box[2] < 550 : record.box[0] > 550))) counts.set(record.fill, (counts.get(record.fill) || 0) + 1);
    // Unmarked regions share one base colour. The two marked regions must
    // agree on the colour of 20 even though it is the before maximum and
    // the after minimum.
    return new Set([...counts].filter(([, count]) => count === 1).map(([fill]) => fill));
  };
  const before = colours('before'), after = colours('after');
  assert.equal(before.size, 2);
  assert.equal(after.size, 2);
  assert.equal([...before].filter(fill => after.has(fill)).length, 1, 'equal numeric values must have equal colours across panels');
});

test('cached boundary layers refresh the available state names', async () => {
  const app = await studio({mapRegion:'indiaDistricts', mapScope:'odisha', mapPins:'', mapValues:''});
  app.set('mapRegion', 'indiaAC', 'change');
  await app.settle();
  app.set('mapScope', 'orissa');
  assert.match(app.get('mapStatus').textContent, /Orissa/);
  app.set('mapRegion', 'indiaDistricts', 'change');
  assert.ok(app.get('mapScope').options.some(option => option.value === 'odisha'));
  assert.ok(!app.get('mapScope').options.some(option => option.value === 'orissa'));
  assert.match(app.get('mapStatus').textContent, new RegExp(String(districtCount)));
  assert.equal(app.requests.filter(url => url === './assets/india-districts-display.geojson').length, 1, 'cached data should be reused');
});

test('headline drag and story-card nudges persist their independent positions', async () => {
  const app = await studio({mapRegion:'indiaStates', mapLayout:'briefing', mapTitle:'Movable headline', mapStateValues:'Karnataka | 42 | State story', mapPins:''});
  const canvas = app.get('mapCanvas');
  const before = app.records().find(record => record.kind === 'text' && record.text === 'Movable headline');
  const subtitleBefore = app.records().find(record => record.kind === 'text' && record.text === app.get('mapDeck').value);
  canvas.emit('pointerdown', {clientX:200, clientY:100, pointerId:1});
  canvas.emit('pointermove', {clientX:224, clientY:112, pointerId:1});
  canvas.emit('pointerup', {clientX:224, clientY:112, pointerId:1});
  const after = app.records().find(record => record.kind === 'text' && record.text === 'Movable headline');
  assert.equal(after.x - before.x, 24);
  assert.equal(after.y - before.y, 12);
  const subtitleAfter = app.records().find(record => record.kind === 'text' && record.text === app.get('mapDeck').value);
  assert.equal(subtitleAfter.x, subtitleBefore.x, 'headline movement leaves subtitle position independent');
  assert.equal(subtitleAfter.y, subtitleBefore.y);
  app.set('mapNudgeTarget', 'rail');
  app.nudge('right');
  const saved = JSON.parse(app.store.get('app_mapPositions_v4'));
  assert.deepEqual(saved.title, {x:24, y:12});
  assert.deepEqual(saved.rail, {x:12, y:0});
});

test('a district label drags independently from the map and saves its own offset', async () => {
  const initial = {mapRegion:'indiaDistricts', mapScope:'karnataka', mapLayout:'atlas', mapPins:'', mapValues:'543 | BJP', mapLabelMode:'marked'};
  const app = await studio(initial);
  const before = app.records().find(record => record.kind === 'text' && record.text === 'Koppal');
  const geometry = () => app.records().filter(record => record.kind === 'polygon').map(record => record.box);
  const mapBefore = geometry();
  const canvas = app.get('mapCanvas');
  canvas.emit('pointerdown', {clientX:before.x, clientY:before.y - 10, pointerId:9});
  canvas.emit('pointermove', {clientX:before.x + 30, clientY:before.y - 28, pointerId:9});
  canvas.emit('pointerup', {clientX:before.x + 30, clientY:before.y - 28, pointerId:9});
  const after = app.records().find(record => record.kind === 'text' && record.text === 'Koppal');
  assert.equal(after.x - before.x, 30);
  assert.equal(after.y - before.y, -18);
  assert.deepEqual(geometry(), mapBefore, 'dragging a label leaves every district boundary in place');
  assert.deepEqual(JSON.parse(app.store.get('app_mapPlaceStyles_v1'))['districts|543'].offset, {x:30, y:-18});
  assert.deepEqual(JSON.parse(app.store.get('app_mapPositions_v4')).map, {x:0, y:0});
  const restored = await studio(initial, {saved:app.store});
  const restoredLabel = restored.records().find(record => record.kind === 'text' && record.text === 'Koppal');
  assert.equal(restoredLabel.x, after.x);
  assert.equal(restoredLabel.y, after.y);
});

test('chart widgets drag independently over the map and persist their final positions', async () => {
  const app = await studio({mapRegion:'indiaDistricts', mapScope:'karnataka', mapLayout:'atlas', mapPins:'', mapValues:'543 | BJP'}, {widgets:true});
  const key = app.widgets.add('donut');
  assert.match(key, /^widget:/);
  const before = app.widgets.getState().widgets[0];
  const canvas = app.get('mapCanvas');
  const x = before.x * canvas.width, y = before.y * canvas.height;
  canvas.emit('pointerdown', {clientX:x, clientY:y, pointerId:7});
  canvas.emit('pointermove', {clientX:x + 36, clientY:y + 24, pointerId:7});
  canvas.emit('pointerup', {clientX:x + 36, clientY:y + 24, pointerId:7});
  const after = app.widgets.getState().widgets[0];
  assert.ok(Math.abs((after.x - before.x) * canvas.width - 36) < .001, 'widget moves by the canvas drag distance horizontally');
  assert.ok(Math.abs((after.y - before.y) * canvas.height - 24) < .001, 'widget moves by the canvas drag distance vertically');
  assert.equal(canvas.hasPointerCapture(7), false);
  const saved = JSON.parse(app.store.get('app_mapWidgets_v1'));
  assert.equal(saved.widgets[0].x, after.x);
  assert.equal(saved.widgets[0].y, after.y);
  const mapPosition = JSON.parse(app.store.get('app_mapPositions_v4')).map;
  assert.deepEqual(mapPosition, {x:0, y:0}, 'dragging the widget leaves the map position unchanged');
  const restored = await studio({mapRegion:'indiaDistricts', mapScope:'karnataka'}, {saved:app.store, widgets:true});
  const restoredWidget = restored.widgets.getState().widgets[0];
  assert.equal(restoredWidget.x, after.x);
  assert.equal(restoredWidget.y, after.y);
});
