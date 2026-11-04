'use strict';

const assert = require('assert');
const DeltaContractV9 = require('../../IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/streaming/delta-contract-v9.js');

let passed = 0;
function ok(cond, label) {
  assert.ok(cond, label);
  passed++;
  console.log('PASS ' + label);
}

const c30 = DeltaContractV9.compute({ outMbps: 9, deltaPct: 30, targetBufferSec: 105, fillTimeSec: 300 });
ok(c30.outputMbps === 9, 'OUT immutable at 9 Mbps');
ok(c30.inputMinMbps === 11.7, 'IN_MIN = 9 * 1.30 = 11.7');
ok(c30.status === 'UNKNOWN', 'no measurement -> UNKNOWN');
ok(c30.theoreticalFillRateSecPerSec === 0.3, 'theoretical fill rate 0.30 s/s');
ok(c30.theoreticalFillTimeSec === 350, '105 / 0.30 = 350 s');

const c35 = DeltaContractV9.compute({ outMbps: 9, deltaPct: 35, targetBufferSec: 105, fillTimeSec: 300 });
ok(c35.inputMinMbps === 12.15, 'IN_MIN = 9 * 1.35 = 12.15');

const green = DeltaContractV9.compute({ outMbps: 9, deltaPct: 35, measuredInputMbps: 14.2 });
ok(green.status === 'GREEN', '14.2 >= 12.15 -> GREEN');
ok(green.viability === 'SUSTAINABLE', 'GREEN viability');
ok(green.headroomMbps === 2.05, 'headroom = 2.05');

const yellow = DeltaContractV9.compute({ outMbps: 9, deltaPct: 35, measuredInputMbps: 10 });
ok(yellow.status === 'YELLOW', '9 <= 10 < 12.15 -> YELLOW');
ok(yellow.viability === 'DEGRADING', 'YELLOW viability');

const red = DeltaContractV9.compute({ outMbps: 9, deltaPct: 35, measuredInputMbps: 8 });
ok(red.status === 'RED', '8 < 9 -> RED');
ok(red.viability === 'UNSUSTAINABLE', 'RED viability');
ok(!DeltaContractV9.canSustain(red), 'RED cannot sustain');

const c0 = DeltaContractV9.compute({ outMbps: 9, deltaPct: 0, measuredInputMbps: 9 });
ok(c0.status === 'GREEN', 'delta 0 with IN=OUT -> GREEN');
ok(c0.theoreticalFillTimeSec === null, 'delta 0 has no finite fill time');

ok(DeltaContractV9.computeMinimumDelta(60, 120) === 50, '60/120 => 50%');
ok(DeltaContractV9.computeMinimumDelta(105, 300) === 35, '105/300 => 35%');
ok(DeltaContractV9.computeMinimumDelta(105, 210) === 50, '105/210 => 50%');

const tag = DeltaContractV9.toM3u8Tag(green);
ok(tag.indexOf('OUT_MBPS=9.0') !== -1, 'tag has OUT');
ok(tag.indexOf('IN_MIN_MBPS=12.15') !== -1, 'tag has IN_MIN');
ok(tag.indexOf('STATUS=GREEN') !== -1, 'tag has STATUS');
ok(tag.indexOf('14.2') === -1, 'tag does not include measured input');

const h = DeltaContractV9.toHttpHeaders(green);
ok(h['X-APE-Output-Mbps'] === '9.0', 'header OUT');
ok(h['X-APE-Input-Min-Mbps'] === '12.15', 'header IN_MIN');
ok(h['X-APE-Delta-Status'] === 'GREEN', 'header status');
ok(h['X-APE-Delta-Verified'] === 'true', 'header verified');

const meta = DeltaContractV9.toJsonMetadata(green, '441');
ok(meta.channel === '441' && meta.verified === true, 'metadata has channel/verified');

assert.throws(() => DeltaContractV9.compute({ outMbps: 0 }), /outMbps/);
assert.throws(() => DeltaContractV9.compute({ outMbps: 9, deltaPct: -1 }), /deltaPct/);
passed += 2;

console.log('\ntest_delta_contract: ' + passed + ' assertions OK');
