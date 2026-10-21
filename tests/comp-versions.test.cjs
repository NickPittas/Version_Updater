const assert = require('node:assert/strict');
const core = require('../extension/jsx/version-core.js');
for (const pass of ['albedo', 'diffuse', 'reflections']) {
  assert.equal(core.sequenceBinName(`card_${pass}_r12_0001.exr`, 12, ''), 'card_12');
  assert.equal(core.sequenceBinName(`card_r12_${pass}_0001.exr`, 12, 'r12'), 'card_12');
  assert.equal(core.sequenceBinName(`card_${pass}_r12_0001.exr`, 12, 'card_r12'), 'card_12');
}
assert.equal(core.sequenceBinName('shot_v002.0001.png', 2, ''), 'shot_2');
assert.equal(core.sequenceBinName('boat_r14_0001.exr', 14, 'boat_sh10_r14'), 'boat_sh10_14');
assert.equal(core.sequenceBinName('cardboard_r12_0001.exr', 12, ''), 'cardboard_12');
console.log('Sequence folder naming checks passed.');
