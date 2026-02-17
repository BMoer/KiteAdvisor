/**
 * Unit tests for kite sizing engine.
 * Run with: node tests/engine.test.js
 */

const {
    AVAILABLE_KITE_SIZES,
    getWindRange,
    roundToStandardSize,
    idealKiteSize,
    getMinKiteSize,
    getMaxPracticalSize,
    hasValidOverlap,
    hasValidSpacing,
    hasValidMinSize,
    optimizeKiteSizes,
    SPOTS
} = require('../js/engine.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
    if (condition) {
        passed++;
    } else {
        failed++;
        console.error('  FAIL: ' + msg);
    }
}

function assertOneOf(actual, allowed, msg) {
    const match = allowed.some(a => JSON.stringify(a) === JSON.stringify(actual));
    if (match) {
        passed++;
    } else {
        failed++;
        console.error('  FAIL: ' + msg);
        console.error('    Got:     ' + JSON.stringify(actual));
        console.error('    Allowed: ' + JSON.stringify(allowed));
    }
}

function section(name) {
    console.log('\n--- ' + name + ' ---');
}

// ============================================================
// Formula check: kite_size = (weight / wind) * 2.2
// ============================================================
section('Single kite formula check');

function formulaCheck(weight, wind, expectedSizes, label) {
    const raw = idealKiteSize(weight, wind);
    const rounded = roundToStandardSize(raw);
    assert(expectedSizes.indexOf(rounded) !== -1,
        label + ': ' + weight + 'kg @ ' + wind + 'kts -> expected one of [' +
        expectedSizes.join(',') + '], got ' + rounded + ' (raw ' + raw.toFixed(1) + ')');
}

formulaCheck(58, 16, [8], '58kg@16kts -> 8m');
formulaCheck(70, 20, [7, 8], '70kg@20kts -> 7-8m');
formulaCheck(80, 15, [11, 12], '80kg@15kts -> 11-12m');
formulaCheck(80, 22, [8], '80kg@22kts -> 8m');

// ============================================================
// Wind range tests
// ============================================================
section('Wind range model');

// min = weight*2.2/size, max = min*1.6
(function() {
    // 80kg/10m: min = 80*2.2/10 = 17.6 → 18, max = 17.6*1.6 = 28.16 → 28
    const r = getWindRange(10, 80, 'intermediate', 'freeride');
    assert(r.min === 18, '80kg/10m min should be 18, got ' + r.min);
    assert(r.max === 28, '80kg/10m max should be 28, got ' + r.max);
})();

(function() {
    // 80kg/12m: min = 80*2.2/12 = 14.67 → 15, max = 14.67*1.6 = 23.47 → 23
    const r = getWindRange(12, 80, 'intermediate', 'freeride');
    assert(r.min === 15, '80kg/12m min should be 15, got ' + r.min);
    assert(r.max === 23, '80kg/12m max should be 23, got ' + r.max);
})();

// GLOBAL_MIN_WIND = 12 should cap min for big kites
(function() {
    // 80kg/15m: raw min = 80*2.2/15 = 11.73 → 12 (capped by GLOBAL_MIN_WIND=12)
    const r = getWindRange(15, 80, 'intermediate', 'freeride');
    assert(r.min === 12, '80kg/15m min should be 12 (capped), got ' + r.min);
    assert(r.max === 19, '80kg/15m max should be 19, got ' + r.max);
})();

// Each kite should cover ~7-15 knots of range
(function() {
    for (const size of [7, 9, 12, 15]) {
        const r = getWindRange(size, 80, 'intermediate', 'freeride');
        const span = r.max - r.min;
        assert(span >= 5 && span <= 15,
            'Wind range for 80kg/' + size + 'm should be 5-15kts wide, got ' + span +
            ' (' + r.min + '-' + r.max + ')');
    }
})();

// ============================================================
// Max practical kite size
// ============================================================
section('Max practical kite size');

(function() {
    // 80kg: 80*2.2/12 = 14.67 → 15
    assert(getMaxPracticalSize(80) === 15, '80kg max practical should be 15, got ' + getMaxPracticalSize(80));
    // 65kg: 65*2.2/12 = 11.92 → 12
    assert(getMaxPracticalSize(65) === 12, '65kg max practical should be 12, got ' + getMaxPracticalSize(65));
    // 90kg: 90*2.2/12 = 16.5 → 17
    assert(getMaxPracticalSize(90) === 17, '90kg max practical should be 17, got ' + getMaxPracticalSize(90));
    // 105kg: 105*2.2/12 = 19.25 → 17 (capped by available sizes)
    assert(getMaxPracticalSize(105) === 17, '105kg max practical should be 17, got ' + getMaxPracticalSize(105));
})();

// ============================================================
// Spacing validation
// ============================================================
section('Spacing validation');

assert(hasValidSpacing([7, 9, 12]) === true, '[7,9,12] should pass spacing');
assert(hasValidSpacing([8, 10, 13]) === true, '[8,10,13] should pass spacing');
assert(hasValidSpacing([8, 11, 15]) === true, '[8,11,15] should pass spacing');
assert(hasValidSpacing([9, 12]) === true, '[9,12] should pass spacing');
assert(hasValidSpacing([10]) === true, '[10] single kite should pass');
assert(hasValidSpacing([5, 17]) === false, '[5,17] should fail spacing (huge gap)');

// ============================================================
// Overlap validation
// ============================================================
section('Overlap validation');

assert(hasValidOverlap([9, 12], 80, 'intermediate', 'freeride') === true,
    '80kg [9,12] should have valid overlap');
assert(hasValidOverlap([8, 11, 15], 80, 'intermediate', 'freeride') === true,
    '80kg [8,11,15] should have valid overlap');

// ============================================================
// Quiver optimization — 80kg at Podersdorf (light wind spot)
// Podersdorf has 7-12 kt mean wind, so optimizer correctly favors larger kites.
// ============================================================
section('Quiver optimization: 80kg @ Podersdorf');

(function() {
    // 1 kite: at a light-wind spot, optimizer picks a larger kite (12-15m)
    const r1 = optimizeKiteSizes(1, 80, 'intermediate', 'freeride', 'podersdorf');
    console.log('  80kg/1 kite: ' + JSON.stringify(r1.kiteSizes));
    assert(r1.kiteSizes[0] >= 12 && r1.kiteSizes[0] <= 15,
        '80kg/1 kite @ Podersdorf: should be 12-15m for light wind, got ' + r1.kiteSizes[0]);

    // 2 kites
    const r2 = optimizeKiteSizes(2, 80, 'intermediate', 'freeride', 'podersdorf');
    console.log('  80kg/2 kites: ' + JSON.stringify(r2.kiteSizes));
    assert(r2.kiteSizes.length === 2, '80kg/2 kites: should have exactly 2');
    assert(r2.kiteSizes[0] >= 8 && r2.kiteSizes[1] <= 15,
        '80kg/2 kites: should be in 8-15m range');

    // 3 kites: expect something like [8,10,13] or [8,11,14] or [8,11,15]
    const r3 = optimizeKiteSizes(3, 80, 'intermediate', 'freeride', 'podersdorf');
    console.log('  80kg/3 kites: ' + JSON.stringify(r3.kiteSizes));
    assert(JSON.stringify(r3.kiteSizes) !== JSON.stringify([7, 10, 15]),
        '80kg/3 kites must NOT be the old broken [7,10,15]');
    assert(r3.kiteSizes[0] >= 8,
        '80kg/3 kites: smallest should be >= 8m, got ' + r3.kiteSizes[0]);
    assert(r3.kiteSizes[2] >= 12 && r3.kiteSizes[2] <= 15,
        '80kg/3 kites: largest should be 12-15m, got ' + r3.kiteSizes[2]);

    // 4 kites
    const r4 = optimizeKiteSizes(4, 80, 'intermediate', 'freeride', 'podersdorf');
    console.log('  80kg/4 kites: ' + JSON.stringify(r4.kiteSizes));
    assert(r4.kiteSizes.length === 4, '80kg/4 kites: should have exactly 4');
    assert(r4.kiteSizes[0] >= 8,
        '80kg/4 kites: smallest should be >= 8m');
})();

// ============================================================
// Quiver optimization — 80kg at Tarifa (strong wind spot)
// Tarifa has 14-22 kt mean wind, so optimizer picks smaller kites.
// ============================================================
section('Quiver optimization: 80kg @ Tarifa');

(function() {
    const r1 = optimizeKiteSizes(1, 80, 'intermediate', 'freeride', 'tarifa');
    console.log('  80kg/1 kite @ Tarifa: ' + JSON.stringify(r1.kiteSizes));
    assert(r1.kiteSizes[0] >= 8 && r1.kiteSizes[0] <= 12,
        '80kg/1 kite @ Tarifa: should be 8-12m for strong wind, got ' + r1.kiteSizes[0]);

    const r3 = optimizeKiteSizes(3, 80, 'intermediate', 'freeride', 'tarifa');
    console.log('  80kg/3 kites @ Tarifa: ' + JSON.stringify(r3.kiteSizes));
    assert(r3.kiteSizes[0] <= 9,
        '80kg/3 kites @ Tarifa: smallest should be <= 9m (strong wind), got ' + r3.kiteSizes[0]);
})();

// ============================================================
// Quiver optimization — 65kg
// ============================================================
section('Quiver optimization: 65kg');

(function() {
    // Max practical size for 65kg = 12m
    const r2 = optimizeKiteSizes(2, 65, 'intermediate', 'freeride', 'podersdorf');
    console.log('  65kg/2 kites: ' + JSON.stringify(r2.kiteSizes));
    assert(r2.kiteSizes[1] <= 12,
        '65kg/2 kites: largest should be <= 12m');
    assert(r2.kiteSizes[0] >= 7,
        '65kg/2 kites: smallest should be >= 7m');

    const r3 = optimizeKiteSizes(3, 65, 'intermediate', 'freeride', 'podersdorf');
    console.log('  65kg/3 kites: ' + JSON.stringify(r3.kiteSizes));
    assert(r3.kiteSizes[0] >= 6,
        '65kg/3 kites: smallest should be >= 6m, got ' + r3.kiteSizes[0]);
    assert(r3.kiteSizes[2] <= 12,
        '65kg/3 kites: largest should be <= 12m');
})();

// ============================================================
// Quiver optimization — 90kg
// ============================================================
section('Quiver optimization: 90kg');

(function() {
    const r4 = optimizeKiteSizes(4, 90, 'intermediate', 'freeride', 'podersdorf');
    console.log('  90kg/4 kites: ' + JSON.stringify(r4.kiteSizes));
    assert(r4.kiteSizes.length === 4, '90kg/4 kites: should have exactly 4');
    assert(r4.kiteSizes[3] >= 14,
        '90kg/4 kites: largest should be >= 14m (heavy rider needs big kite)');
})();

// ============================================================
// Quiver optimization — 105kg
// ============================================================
section('Quiver optimization: 105kg');

(function() {
    const r3 = optimizeKiteSizes(3, 105, 'intermediate', 'freeride', 'podersdorf');
    console.log('  105kg/3 kites: ' + JSON.stringify(r3.kiteSizes));
    assert(r3.kiteSizes.length === 3, '105kg/3 kites: should have 3 kites');
    assert(r3.kiteSizes[2] >= 14,
        '105kg/3 kites: largest should be >= 14m, got ' + r3.kiteSizes[2]);
})();

// ============================================================
// Wind range overlap in all recommended quivers
// ============================================================
section('Wind range overlap in recommended quivers');

for (const weight of [65, 80, 90, 105]) {
    for (const n of [1, 2, 3]) {
        for (const spot of ['podersdorf', 'tarifa']) {
            const r = optimizeKiteSizes(n, weight, 'intermediate', 'freeride', spot);
            if (!r.kiteSizes) continue;
            const valid = hasValidOverlap(r.kiteSizes, weight, 'intermediate', 'freeride');
            assert(valid, weight + 'kg/' + n + ' kites @ ' + spot + ': should have valid overlap');
            const spacingOk = hasValidSpacing(r.kiteSizes);
            assert(spacingOk, weight + 'kg/' + n + ' kites @ ' + spot + ': should have valid spacing');
        }
    }
}

// ============================================================
// Spot comparison: Tarifa (windier) should yield more rideable days
// ============================================================
section('Spot comparison: Tarifa vs Podersdorf');

(function() {
    const rPoder = optimizeKiteSizes(3, 80, 'intermediate', 'freeride', 'podersdorf');
    const rTarifa = optimizeKiteSizes(3, 80, 'intermediate', 'freeride', 'tarifa');
    console.log('  Podersdorf: ' + rPoder.totalRideableDays + ' days ' + JSON.stringify(rPoder.kiteSizes));
    console.log('  Tarifa:     ' + rTarifa.totalRideableDays + ' days ' + JSON.stringify(rTarifa.kiteSizes));
    assert(rTarifa.totalRideableDays > rPoder.totalRideableDays,
        'Tarifa (windier) should yield more rideable days than Podersdorf');
})();

// ============================================================
// Summary
// ============================================================
console.log('\n============================');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('============================\n');

if (failed > 0) process.exit(1);
