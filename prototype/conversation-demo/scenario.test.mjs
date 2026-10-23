import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DEMO, initialState, stateAt, schedule, applyOp, familyView } from './scenario.mjs';
const at = (id, scenario = 'main') => {
  const i = DEMO.scenarios[scenario].steps.findIndex(s => s.id === id);
  assert.ok(i >= 0, `missing cue ${id}`);
  return stateAt(scenario, i);
};
const simulatedElder = { id: 'TEST', speaker: 'elder', when: 'test' };
const simulatedSource = { session: 'TEST', turn: 'TEST', revision: 1, final: true, text: '明确确认' };

test('all main/branch snapshots replay deterministically; timing is bounded and complete', () => {
  for (const [id, scene] of Object.entries(DEMO.scenarios)) {
    assert.equal(new Set(scene.steps.map(s => s.id)).size, scene.steps.length);
    for (let i = 0; i < scene.steps.length; i++) assert.deepEqual(stateAt(id, i), stateAt(id, i));
    const times = schedule(id);
    assert.equal(times[0].start, 0);
    assert.ok(times.every(t => t.duration > 0));
    assert.ok(Math.abs(times.at(-1).end - scene.seconds) < .00001);
  }
});
test('retrieval fixtures are private; memory candidate is not immediately an effective memory', () => {
  assert.equal(at('A02').memories.length, 3);
  assert.equal(at('A03').memories.length, 4);
  assert.equal(at('A03').memories.find(m => m.id === 'M04').source.turn, 'A01');
  assert.ok(at('A03').memories.every(m => m.owner === DEMO.owner && m.visibility === 'private'));
  assert.deepEqual(familyView(at('A03')), { projections: [], requests: [], messages: [] });
});
test('correction invalidates old reminder; explicit confirmation still does not imply saved', () => {
  const corrected = at('A07');
  assert.equal(corrected.candidates.find(c => c.id === 'C-R1').status, 'superseded');
  assert.equal(corrected.reminders.length, 0);
  assert.equal(at('A09').confirmations[0].source.turn, 'A09');
  assert.equal(at('A09').reminders.length, 0);
  const saved = at('A10').reminders;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].due, '2026-10-24T10:00:00+08:00');
  assert.equal(saved[0].recurrence, 'once');
  assert.throws(() => applyOp(corrected, { type: 'commit', id: 'C-R1', key: 'stale' }, simulatedElder, simulatedSource), /stale/);
});
test('model boolean does not authorize a side effect; partial/foreign owner cannot commit', () => {
  const unconfirmed = at('A08');
  unconfirmed.candidates.find(c => c.id === 'C-R2').confirmed = true;
  assert.throws(() => applyOp(unconfirmed, { type: 'commit', id: 'C-R2', key: 'fake' }, simulatedElder, simulatedSource), /confirmation/);
  assert.throws(() => applyOp(unconfirmed, { type: 'confirm', id: 'C-R2' }, { ...simulatedElder, speaker: 'agent' }, simulatedSource), /elder/);
  for (const mutation of ['partial', 'foreign']) {
    const s = at('A02');
    const candidate = s.candidates.find(c => c.id === 'C-M04');
    if (mutation === 'partial') candidate.source.final = false;
    else candidate.owner = 'another-elder';
    assert.throws(() => applyOp(s, { type: 'commit', id: 'C-M04', key: 'fake' }, simulatedElder, simulatedSource), /partial|owner/);
  }
});
test('new session has no old working context; revisions preserve source without overwriting v1 history', () => {
  assert.equal(at('B00').context.length, 0);
  assert.equal(at('B00').memories.length, 4);
  const changed = at('B04');
  assert.equal(changed.memories.find(m => m.id === 'M03').version, 2);
  assert.match(changed.memories.find(m => m.id === 'M03').text, /薄片/);
  assert.equal(changed.memoryHistory[0].version, 1);
  assert.equal(changed.memoryHistory[0].status, 'superseded');
  assert.equal(changed.memoryHistory[0].source.session, 'S-00');
  assert.equal(changed.memories.find(m => m.id === 'M03').source.turn, 'B03');
});
test('private corrections do not silently change shared requests; new permission updates one existing request', () => {
  assert.equal(at('B05').requests[0].version, 1);
  assert.equal(at('B06').requests.length, 1);
  assert.equal(at('B06').requests[0].version, 2);
  const stale = at('B06');
  const candidate = stale.candidates.find(c => c.id === 'C-Q1');
  candidate.status = 'candidate';
  assert.throws(() => applyOp(stale, { type: 'commit', id: 'C-Q1', key: 'late-command' }, simulatedElder, simulatedSource), /version/);
});
test('family receives minimal authorized records, not full private memory or reminders', () => {
  assert.equal(familyView(at('A12')).projections.length, 0);
  const view = familyView(at('B06'));
  assert.equal(view.projections.length, 1);
  assert.equal(view.requests.length, 1);
  assert.ok(!('memories' in view) && !('reminders' in view) && !('context' in view));
  assert.ok(!JSON.stringify(view).includes('换水'));
  assert.ok(!('text' in view.projections[0].source), 'raw agent prompt can contain unshared clauses');
  assert.equal(view.requests[0].authorizationSource.turn, 'B06');
  assert.deepEqual(familyView(at('B06'), 'unrelated-family'), { projections: [], requests: [], messages: [] });
  const revoked = at('B06');
  revoked.grants.forEach(g => { g.active = false; });
  assert.equal(familyView(revoked).projections.length, 0);
  assert.equal(familyView(revoked).requests.length, 0);
});
test('privacy branch does not inherit grants, requests, or sharing hints; switching is isolated', () => {
  const denied = at('P03', 'privacy');
  assert.equal(denied.memories.length, 4);
  assert.equal(denied.reminders.length, 1);
  assert.equal(denied.projections.length, 0);
  assert.equal(denied.grants.length, 0);
  assert.equal(denied.requests.length, 0);
  assert.deepEqual(familyView(denied), { projections: [], requests: [], messages: [] });
  assert.throws(() => applyOp(denied, { type: 'commit', id: 'C-S1', key: 'denied' }, simulatedElder, simulatedSource), /denied/);
  at('END');
  assert.deepEqual(stateAt('main', 0), initialStateWithSession());
});
function initialStateWithSession() { return { ...initialState(), session: 'S-A' }; }
test('failure is not effective; retry and duplicate submission result in exactly one reminder', () => {
  const failed = at('X01', 'failure');
  assert.equal(failed.reminders.length, 0);
  assert.equal(failed.receipts.at(-1).result, 'storage_unavailable');
  assert.ok(!failed.dedupe['reminder:SA:A09:v2']);
  assert.equal(at('X02', 'failure').reminders.length, 1);
  const duplicate = at('X03', 'failure');
  assert.equal(duplicate.reminders.length, 1);
  assert.equal(duplicate.receipts.at(-1).result, 'already_applied');
});
test('the reminder and request have separate lifecycles; close needs elder receipt after family report', () => {
  assert.equal(at('B09').reminders[0].status, 'reported_done');
  assert.equal(at('B09').requests[0].status, 'requested');
  assert.equal(at('F03').requests[0].status, 'accepted');
  assert.equal(at('F04').requests[0].status, 'reported_done');
  assert.equal(at('C04').requests[0].status, 'closed');
  assert.equal(at('C04').requests[0].closedSource.turn, 'C04');
  const notAccepted = at('F02');
  assert.throws(() => applyOp(notAccepted, { type: 'request.finish', id: 'Q01' }, { speaker: 'family' }, simulatedSource), /acceptance/);
  assert.throws(() => applyOp(at('F03'), { type: 'request.close', id: 'Q01' }, simulatedElder, simulatedSource), /receipt/);
});
test('message provenance and relay are independent of request acceptance', () => {
  assert.equal(at('F02').messages[0].sender, DEMO.family);
  assert.equal(at('F02').messages[0].status, 'submitted');
  assert.equal(at('C01').messages[0].status, 'relayed');
  assert.equal(at('C01').requests[0].status, 'accepted');
});
test('built single HTML contains parseable inline code, no external script or local fetch dependency', () => {
  const html = fs.readFileSync(new URL('../conversation-demo.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length >= 5);
  scripts.forEach((match, i) => assert.doesNotThrow(() => new vm.Script(match[1], { filename: `inline-${i}.js` })));
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.doesNotMatch(html, /\bfetch\s*\(|getUserMedia\s*\(/);
  assert.match(html, /lang="zh-CN"/);
  const svg = html.match(/<svg viewBox=[\s\S]*?<\/svg>/)[0];
  assert.doesNotMatch(svg, /(?:fill|stroke)="(?:#|rgb)/);
  const firstComponent = svg.search(/<rect[^>]+class="c-(?:frontend|backend|database|cloud|security|messagebus|external)"/);
  const arrows = [...svg.matchAll(/<(?:line|path)[^>]+marker-end=/g)];
  assert.ok(arrows.every(m => m.index < firstComponent), 'arrows must precede components');
  const messageBlock = svg.split('<!-- Messages -->')[1].split('<!-- Animated flowing dots -->')[0];
  const paths = [...messageBlock.matchAll(/<path d="([^"]+)"[^>]+marker-end=/g)].map(m => m[1]);
  const motions = [...svg.matchAll(/<animateMotion[^>]+path="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(motions, paths, 'moving dots must follow the arrow path from source to destination');
  const styled = [...svg.matchAll(/<rect\s+([^>]+)class="c-(?:frontend|backend|database|cloud|security|messagebus|external)"[^>]*>/g)];
  assert.ok(styled.length > 0);
  styled.forEach(m => {
    const mask = svg.slice(0, m.index).match(/<rect\s+([^>]+)class="c-mask"\/>\s*$/);
    assert.ok(mask, 'component needs an immediately preceding mask');
    assert.equal(mask[1], m[1], 'mask and component geometry must match');
  });
});
test('Archify toolbar, original CSS and scripts stay untouched', () => {
  const html = fs.readFileSync(new URL('../conversation-demo.html', import.meta.url), 'utf8');
  const template = fs.readFileSync(new URL('../../.agents/skills/dynamic-archify/assets/template.html', import.meta.url), 'utf8');
  const scripts = text => [...text.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.deepEqual(scripts(html).slice(0, -1), scripts(template));
  assert.equal(html.match(/<style>([\s\S]*?)<\/style>/)[1], template.match(/<style>([\s\S]*?)<\/style>/)[1]);
  const toolbar = template.match(/  <div class="toolbar"[\s\S]*?(?=\n\n  <div class="container">)/)[0];
  assert.ok(html.includes(toolbar));
});
