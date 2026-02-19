/**
 * Kite Size Optimizer Engine
 * Wind data from pre-computed Meteostat JSON files.
 * Branded for Moerzinger.eu (www.moerzinger.eu)
 */

// ============================================================
// SPOT DATA
// ============================================================

const MONTH_NAMES_DE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MONTH_NAMES_FULL_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const SPOTS = {
    podersdorf: {
        name: 'Podersdorf am Neusiedlersee',
        country: '\u00d6sterreich',
        flag: '\u{1F1E6}\u{1F1F9}',
        description: 'Flachwasser-Spot am Neusiedlersee mit thermischen Winden. Saison ca. April\u2013Oktober. B\u00f6ige Bedingungen, NW- und SO-Windrichtungen dominant. Stehtiefes Wasser in Ufern\u00e4he.',
        windParams: []
    },
    tarifa: {
        name: 'Tarifa',
        country: 'Spanien',
        flag: '\u{1F1EA}\u{1F1F8}',
        description: 'Einer der windigsten Spots Europas. Levante (Ost) und Poniente (West) Winde sorgen f\u00fcr zuverl\u00e4ssigen Wind fast das ganze Jahr. Hauptsaison Mai\u2013September mit starkem, konstantem Wind.',
        windParams: []
    },
    lo_stagnone: {
        name: 'Lo Stagnone',
        country: 'Sizilien, Italien',
        flag: '\u{1F1EE}\u{1F1F9}',
        description: 'Flache Lagune mit konstantem Thermalwind. Saison April\u2013Oktober. Stehtiefes, warmes Wasser \u2013 ideal f\u00fcr Einsteiger und Fortgeschrittene. Maestrale und Scirocco als Hauptwindrichtungen.',
        windParams: []
    },
    hamata: {
        name: 'Hamata',
        country: '\u00c4gypten',
        flag: '\u{1F1EA}\u{1F1EC}',
        description: 'Premium-Spot am s\u00fcdlichen Roten Meer. Zuverl\u00e4ssiger thermischer Nordwind (Shamal) von M\u00e4rz bis November. Flachwasser-Lagune mit t\u00fcrkisem Wasser, konstante Side-Onshore-Bedingungen. Einer der windsichersten Spots weltweit.',
        windParams: []
    }
};

const SYNTHETIC_ALLOWED_SPOTS = new Set(['podersdorf', 'hamata']);

// ============================================================
// JSON WIND DATA LOADER
// ============================================================

/** Cache for loaded JSON wind data. Key = spotKey, value = parsed JSON. */
const _windDataCache = {};

/**
 * Load pre-computed wind data JSON for a spot.
 * Returns the parsed JSON or null if unavailable.
 */
async function loadSpotWindData(spotKey) {
    if (_windDataCache[spotKey] !== undefined) return _windDataCache[spotKey];
    try {
        const resp = await fetch('data/' + spotKey + '.json');
        if (!resp.ok) throw new Error(resp.status);
        const data = await resp.json();
        _windDataCache[spotKey] = data;
        return data;
    } catch (e) {
        _windDataCache[spotKey] = null;
        return null;
    }
}

/** Preload all spot wind data (call on page load). */
async function preloadAllWindData() {
    await Promise.all(Object.keys(SPOTS).map(loadSpotWindData));
}

/**
 * Convert histogram buckets to 1-knot bins (days per year).
 * For 1-knot source buckets this keeps raw aggregation.
 * For legacy >1-knot buckets we fall back to uniform split.
 * @param {Array} buckets — [{min_kts, max_kts, hours}, ...]
 * @param {number} numYears — number of years the data spans
 * @param {number} maxKnots — max knot value for output array
 * @returns {Float64Array} — days per year for each 1-knot bin [0..maxKnots]
 */
function bucketsToDailyBins(buckets, numYears, maxKnots) {
    const bins = new Float64Array(maxKnots + 1);
    for (const b of buckets) {
        const width = b.max_kts - b.min_kts;
        if (width <= 0) continue;
        const daysPerYear = (b.hours / numYears) / 24;

        if (width === 1) {
            const v = b.min_kts;
            if (v >= 0 && v <= maxKnots) bins[v] += daysPerYear;
            continue;
        }

        const daysPerKnotPerYear = daysPerYear / width;
        for (let v = b.min_kts; v < b.max_kts && v <= maxKnots; v++) {
            bins[v] += daysPerKnotPerYear;
        }
    }
    return bins;
}

function getNumYears(wd) {
    return wd && wd.years_covered && wd.years_covered.length ? wd.years_covered.length : 5;
}

function getMonthlyBinsForMonth(wd, monthIndex, maxKnots) {
    const monthBuckets = wd.wind_distribution_monthly[String(monthIndex + 1)];
    return bucketsToDailyBins(monthBuckets || [], getNumYears(wd), maxKnots);
}

function getDaylightHourlyRecords(wd) {
    return (wd && Array.isArray(wd.daylight_hourly)) ? wd.daylight_hourly : [];
}

function hasMeteostatData(wd) {
    return !!(wd &&
              wd.station_id &&
              wd.station_id !== 'synthetic' &&
              wd.wind_distribution_monthly &&
              Array.isArray(wd.daylight_hourly));
}

function hasAllowedSyntheticData(spotKey, wd) {
    return !!(wd &&
              wd.station_id === 'synthetic' &&
              SYNTHETIC_ALLOWED_SPOTS.has(spotKey) &&
              wd.wind_distribution_monthly &&
              Array.isArray(wd.daylight_hourly));
}

function getSpotDataMode(spotKey) {
    const wd = _windDataCache[spotKey];
    if (hasMeteostatData(wd)) return 'meteostat';
    if (hasAllowedSyntheticData(spotKey, wd)) return 'synthetic';
    return 'none';
}

function spotHasUsableWindData(spotKey) {
    return getSpotDataMode(spotKey) !== 'none';
}

function isWindInAnyRange(windKts, ranges) {
    if (windKts === null || windKts === undefined) return false;
    return ranges.some(function (r) { return windKts >= r.min && windKts <= r.max; });
}

function hasTwoConsecutiveRideableHours(dayWinds, ranges) {
    for (var i = 0; i < dayWinds.length - 1; i++) {
        if (isWindInAnyRange(dayWinds[i], ranges) && isWindInAnyRange(dayWinds[i + 1], ranges)) {
            return true;
        }
    }
    return false;
}

// ============================================================
// KITE WIND RANGE MODEL
// ============================================================

const AVAILABLE_KITE_SIZES = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17];

/**
 * Formula-based wind range model.
 *
 * Industry standard: kite_size_m² = (rider_weight_kg / wind_kts) × 2.2
 * Rearranged:        ideal_wind   = (rider_weight × 2.2) / kite_size
 *
 * Each kite covers a range around its ideal wind:
 *   min  = ideal × 0.80   (underpowered limit)
 *   max  = ideal × 1.33   (overpowered / comfortable limit)
 *   safe = ideal × 1.55   (absolute safety ceiling)
 */
const WIND_RANGE_MIN_FACTOR = 0.80;
const WIND_RANGE_MAX_FACTOR = 1.33;
const WIND_RANGE_SAFETY_FACTOR = 1.55;
const GLOBAL_MIN_WIND = 10;

const SKILL_ADJUSTMENTS = {
    beginner:     { minAdd: 2,  maxAdd: -3 },
    intermediate: { minAdd: 1,  maxAdd: -1 },
    advanced:     { minAdd: 0,  maxAdd: 0 },
    expert:       { minAdd: -1, maxAdd: 1 }
};

const STYLE_ADJUSTMENTS = {
    freeride:  { minAdd: 0, maxAdd: 0 },
    freestyle: { minAdd: 1, maxAdd: -1 },
    bigair:    { minAdd: 1, maxAdd: 2 }
};

function getWindRange(kiteSize, riderWeight, skillLevel, ridingStyle) {
    const idealWind = (riderWeight * 2.2) / kiteSize;
    const skill = SKILL_ADJUSTMENTS[skillLevel] || SKILL_ADJUSTMENTS.intermediate;
    const style = STYLE_ADJUSTMENTS[ridingStyle] || STYLE_ADJUSTMENTS.freeride;
    const safetyMax = Math.round(idealWind * WIND_RANGE_SAFETY_FACTOR);
    return {
        min: Math.max(GLOBAL_MIN_WIND,
                      Math.round(idealWind * WIND_RANGE_MIN_FACTOR) + skill.minAdd + style.minAdd),
        max: Math.min(safetyMax,
                      Math.round(idealWind * WIND_RANGE_MAX_FACTOR) + skill.maxAdd + style.maxAdd)
    };
}

// ============================================================
// WIND DISTRIBUTION COMPUTATION
// ============================================================

/**
 * Compute the yearly wind speed distribution for a spot.
 * Uses Meteostat-backed JSON monthly distributions.
 * Returns an array of { knots, daysPerYear } for each 1-knot bin from 0 to maxKnots.
 */
function computeYearlyWindDistribution(spotKey, maxKnots) {
    if (maxKnots === undefined) maxKnots = 45;

    const wd = _windDataCache[spotKey];
    if (spotHasUsableWindData(spotKey) && wd && wd.wind_distribution_monthly) {
        const bins = new Float64Array(maxKnots + 1);
        for (let m = 0; m < 12; m++) {
            const monthBins = getMonthlyBinsForMonth(wd, m, maxKnots);
            for (let v = 0; v <= maxKnots; v++) bins[v] += monthBins[v];
        }
        const distribution = [];
        for (let v = 0; v <= maxKnots; v++) {
            distribution.push({ knots: v, daysPerYear: bins[v] });
        }
        return distribution;
    }
    return [];
}

// ============================================================
// OPTIMIZATION ENGINE
// ============================================================

/**
 * Compute how many days per year are rideable with a given set of kite sizes.
 * Uses Meteostat-backed JSON monthly data.
 */
function computeRideableDays(kiteSizes, riderWeight, skillLevel, ridingStyle, spotKey) {
    const spot = SPOTS[spotKey];
    if (!spot) return { totalDays: 0, monthlyDays: [], coverageByKnot: [] };

    const ranges = kiteSizes.map(function (s) { return getWindRange(s, riderWeight, skillLevel, ridingStyle); });
    var totalDays = 0;
    var maxKnots = 45;
    var coverageByKnot = new Array(maxKnots + 1).fill(0);

    var wd = _windDataCache[spotKey];
    if (!spotHasUsableWindData(spotKey) || !wd || !wd.wind_distribution_monthly || !wd.daylight_hourly) {
        return { totalDays: 0, monthlyDays: [], coverageByKnot: [] };
    }

    var numYears = getNumYears(wd);
    var monthlyCounts = new Array(12).fill(0);
    var records = getDaylightHourlyRecords(wd);

    for (var d = 0; d < records.length; d++) {
        var rec = records[d];
        if (!rec || !rec.date || !Array.isArray(rec.winds_kts)) continue;
        var month = parseInt(rec.date.slice(5, 7), 10) - 1;
        if (month < 0 || month > 11) continue;
        if (hasTwoConsecutiveRideableHours(rec.winds_kts, ranges)) {
            monthlyCounts[month] += 1;
        }
    }
    var monthlyDays = monthlyCounts.map(function (count) { return count / numYears; });
    for (var m = 0; m < 12; m++) {
        totalDays += monthlyDays[m];
    }

    var distribution = computeYearlyWindDistribution(spotKey, maxKnots);
    for (var v = 0; v <= maxKnots; v++) {
        var inRange = ranges.some(function (r) { return v >= r.min && v <= r.max; });
        coverageByKnot[v] = inRange && distribution[v] ? distribution[v].daysPerYear : 0;
    }

    return { totalDays: totalDays, monthlyDays: monthlyDays, coverageByKnot: coverageByKnot };
}

/**
 * Generate all k-combinations from an array.
 */
function* combinations(arr, k) {
    if (k === 0) { yield []; return; }
    for (let i = 0; i <= arr.length - k; i++) {
        for (const rest of combinations(arr.slice(i + 1), k - 1)) {
            yield [arr[i], ...rest];
        }
    }
}

/**
 * Validate that a set of kites has no wind-range gaps > 2 knots.
 */
function hasValidOverlap(kiteSizes, riderWeight, skillLevel, ridingStyle) {
    if (kiteSizes.length <= 1) return true;
    var sorted = kiteSizes.slice().sort(function (a, b) { return b - a; });
    for (var i = 0; i < sorted.length - 1; i++) {
        var rangeBig   = getWindRange(sorted[i],     riderWeight, skillLevel, ridingStyle);
        var rangeSmall = getWindRange(sorted[i + 1], riderWeight, skillLevel, ridingStyle);
        if (rangeSmall.min - rangeBig.max > 2) return false;
    }
    return true;
}

/**
 * Find the optimal set of kite sizes that maximizes rideable wind days.
 * Uses brute-force search over all combinations with overlap constraint.
 */
function optimizeKiteSizes(numKites, riderWeight, skillLevel, ridingStyle, spotKey) {
    if (!spotHasUsableWindData(spotKey)) return null;

    let bestCombo = null;
    let bestDays = -1;
    let bestResult = null;

    for (const combo of combinations(AVAILABLE_KITE_SIZES, numKites)) {
        if (!hasValidOverlap(combo, riderWeight, skillLevel, ridingStyle)) continue;
        const result = computeRideableDays(combo, riderWeight, skillLevel, ridingStyle, spotKey);
        if (result.totalDays > bestDays) {
            bestDays = result.totalDays;
            bestCombo = combo;
            bestResult = result;
        }
    }

    if (!bestCombo || !bestResult) return null;

    return {
        kiteSizes: bestCombo,
        totalRideableDays: Math.round(bestDays),
        monthlyRideableDays: bestResult.monthlyDays.map(d => Math.round(d * 10) / 10),
        coverageByKnot: bestResult.coverageByKnot,
        windRanges: bestCombo.map(s => getWindRange(s, riderWeight, skillLevel, ridingStyle)),
        totalDaysInYear: 365
    };
}
