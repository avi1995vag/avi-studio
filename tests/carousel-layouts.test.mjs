import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../assets/creative.js', import.meta.url), 'utf8');
const { chooseCarouselLayout, carouselChartRows } = runInNewContext(`${source}\n;({chooseCarouselLayout,carouselChartRows})`);
const frame = (title, body, fields = {}) => ({title, body, ...fields});

test('chooses layouts by content and retains substantive final frames', () => {
  const checklist = frame('Three useful habits', '• Pick a cue\n• Start small\n• Track progress');
  for (const index of [1, 3, 6]) {
    assert.equal(chooseCarouselLayout(checklist, index, 7, true), 'carousel-list');
  }
  assert.equal(chooseCarouselLayout(checklist, 0, 7, true), 'carousel-lead');
  assert.equal(chooseCarouselLayout(frame('ಬದಲಾವಣೆಯ ಹಂತಗಳು', 'ಹಂತ ೧: ಆಯ್ಕೆ ಮಾಡಿ\nಹಂತ ೨: ಆರಂಭಿಸಿ'), 3, 7, false), 'carousel-sequence');
  assert.equal(chooseCarouselLayout(frame('ಬದಲಾವಣೆಯ ಹಂತಗಳು', 'ಆಯ್ಕೆ ಮಾಡಿ\nಆರಂಭಿಸಿ\nಮುಂದುವರಿಸಿ'), 3, 7, false), 'carousel-sequence');
  assert.equal(chooseCarouselLayout(frame('The chronology', '• 2008: Began training\n• 2011: Joined the team'), 2, 7, true), 'carousel-sequence');
  assert.equal(chooseCarouselLayout(frame('In their words', '“Start small.” — The coach'), 4, 7, true), 'carousel-quote');
  assert.equal(chooseCarouselLayout(frame('How it works', '“Small” changes can build confidence.'), 6, 7, false), 'carousel-type');
  assert.equal(chooseCarouselLayout(frame('Photo context', 'A training session in Bengaluru.'), 2, 7, true), 'carousel-feature');
  assert.equal(chooseCarouselLayout(frame('ಸಾರಾಂಶ', 'ಒಂದು ಅಭ್ಯಾಸದಿಂದ ಆರಂಭಿಸಿ.'), 6, 7, true), 'carousel-close');
});

test('requires comparable labeled numbers before fitting a chart', () => {
  const chartData = [{label:'Group A',value:75},{label:'Group B',value:62}];
  const comparison = frame('Survey results', 'Group A: 75%\nGroup B: 62%', {chartData});
  assert.equal(chooseCarouselLayout(comparison, 2, 7, true), 'carousel-chart');
  assert.deepEqual(Array.from(carouselChartRows(comparison), row => row.unit), ['%', '%']);
  assert.equal(carouselChartRows(comparison, 'Group A: 70%, Group B: 60%').length, 0);
  assert.equal(carouselChartRows({...comparison,body:'Group A: $75\nGroup B: ₹62'}).length, 0);
  assert.equal(carouselChartRows({...comparison,body:'Group A: 75 km\nGroup B: 62 kg'}).length, 0);
  assert.equal(carouselChartRows(frame('Quarterly results', 'Q1: 45\nQ2: 60', {chartData:[{label:'Q1',value:1},{label:'Q2',value:2}]})).length, 0);
  assert.equal(chooseCarouselLayout(frame('ಅಂಕಿಅಂಶ', 'ಗುಂಪು ಎ: ೭೫%\nಗುಂಪು ಬಿ: ೬೨%'), 3, 7, false), 'carousel-chart');
  assert.equal(carouselChartRows({...comparison,chartData:[],chartOrigin:'generated'}).length, 0);
});
