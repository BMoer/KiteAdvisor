/**
 * Kite Size Optimizer Engine
 * Wind data from pre-computed JSON files (Meteostat / synthetic).
 * Falls back to built-in Weibull model when JSON is not available.
 * Branded for Moerzinger.eu (www.moerzinger.eu)
 */

// ============================================================
// MATH HELPERS (Weibull fallback)
// ============================================================

function gamma(z) {
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    z -= 1;
    const g = 7;
    const c = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028,
        771.32342877765313, -176.61502916214059, 12.507343278686905,
        -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
    ];
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

function weibullScale(mean, shape) { return mean / gamma(1 + 1 / shape); }
function weibullCDF(v, shape, scale) { return v <= 0 ? 0 : 1 - Math.exp(-Math.pow(v / scale, shape)); }
function weibullProbBetween(vMin, vMax, shape, scale) { return weibullCDF(vMax, shape, scale) - weibullCDF(vMin, shape, scale); }

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
        windParams: [
            { k: 1.8, mean: 7 }, { k: 1.9, mean: 8 }, { k: 2.0, mean: 9 }, { k: 2.0, mean: 11 },
            { k: 2.1, mean: 12 }, { k: 2.1, mean: 11 }, { k: 2.0, mean: 10 }, { k: 1.9, mean: 9 },
            { k: 2.0, mean: 10 }, { k: 2.0, mean: 10 }, { k: 1.9, mean: 8 }, { k: 1.8, mean: 7 }
        ]
    },
    tarifa: {
        name: 'Tarifa',
        country: 'Spanien',
        flag: '\u{1F1EA}\u{1F1F8}',
        description: 'Einer der windigsten Spots Europas. Levante (Ost) und Poniente (West) Winde sorgen f\u00fcr zuverl\u00e4ssigen Wind fast das ganze Jahr. Hauptsaison Mai\u2013September mit starkem, konstantem Wind.',
        windParams: [
            { k: 2.0, mean: 14 }, { k: 2.0, mean: 14 }, { k: 2.1, mean: 15 }, { k: 2.2, mean: 16 },
            { k: 2.3, mean: 18 }, { k: 2.4, mean: 20 }, { k: 2.5, mean: 22 }, { k: 2.5, mean: 21 },
            { k: 2.3, mean: 18 }, { k: 2.1, mean: 15 }, { k: 2.0, mean: 14 }, { k: 2.0, mean: 13 }
        ]
    },
    lo_stagnone: {
        name: 'Lo Stagnone',
        country: 'Sizilien, Italien',
        flag: '\u{1F1EE}\u{1F1F9}',
        description: 'Flache Lagune mit konstantem Thermalwind. Saison April\u2013Oktober. Stehtiefes, warmes Wasser \u2013 ideal f\u00fcr Einsteiger und Fortgeschrittene. Maestrale und Scirocco als Hauptwindrichtungen.',
        windParams: [
            { k: 1.7, mean: 8 }, { k: 1.8, mean: 9 }, { k: 2.0, mean: 11 }, { k: 2.2, mean: 14 },
            { k: 2.4, mean: 16 }, { k: 2.5, mean: 18 }, { k: 2.6, mean: 19 }, { k: 2.5, mean: 18 },
            { k: 2.3, mean: 15 }, { k: 2.0, mean: 12 }, { k: 1.8, mean: 9 }, { k: 1.7, mean: 8 }
        ]
    },
    hamata: {
        name: 'Hamata',
        country: '\u00c4gypten',
        flag: '\u{1F1EA}\u{1F1EC}',
        description: 'Premium-Spot am s\u00fcdlichen Roten Meer. Zuverl\u00e4ssiger thermischer Nordwind (Shamal) von M\u00e4rz bis November. Flachwasser-Lagune mit t\u00fcrkisem Wasser, konstante Side-Onshore-Bedingungen. Einer der windsichersten Spots weltweit.',
        windParams: [
            { k: 2.2, mean: 14 }, { k: 2.3, mean: 15 }, { k: 2.5, mean: 17 }, { k: 2.7, mean: 19 },
            { k: 2.9, mean: 21 }, { k: 3.0, mean: 22 }, { k: 3.1, mean: 23 }, { k: 3.0, mean: 22 },
            { k: 2.8, mean: 20 }, { k: 2.5, mean: 17 }, { k: 2.3, mean: 15 }, { k: 2.2, mean: 14 }
        ]
    },
    watamu: {
        name: 'Watamu',
        country: 'Kenia',
        flag: '\u{1F1F0}\u{1F1EA}',
        description: 'Tropischer Kite-Spot an der kenianischen K\u00fcste. Zwei Windsaisons: Juni\u2013September (Kusi, S\u00fcdost) und Dezember\u2013Februar (Kaskazi, Nordost). Warmes Wasser, Riff-gesch\u00fctzte Lagune, ideal f\u00fcr Freeride und Freestyle.',
        windParams: [
            { k: 2.3, mean: 14 }, { k: 2.2, mean: 13 }, { k: 2.0, mean: 10 }, { k: 1.8, mean: 8 },
            { k: 1.7, mean: 7 }, { k: 2.0, mean: 12 }, { k: 2.3, mean: 16 }, { k: 2.4, mean: 17 },
            { k: 2.3, mean: 15 }, { k: 2.0, mean: 10 }, { k: 1.8, mean: 8 }, { k: 2.1, mean: 12 }
        ]
    }
};

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
 * Convert a 5-knot-bucket histogram into 1-knot bins (days per year).
 * Distributes hours uniformly within each bucket.
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
        const hoursPerKnotPerYear = (b.hours / numYears) / width;
        const daysPerKnotPerYear = hoursPerKnotPerYear / 24;
        for (let v = b.min_kts; v < b.max_kts && v <= maxKnots; v++) {
            bins[v] = daysPerKnotPerYear;
        }
    }
    return bins;
}

// ============================================================
// KITE WIND RANGE MODEL
// ============================================================

const AVAILABLE_KITE_SIZES = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17];

/**
 * Formula: kite_size_m² = (rider_weight_kg / wind_knots) × 2.2
 * Rearranged: wind_knots = (rider_weight × 2.2) / kite_size
 *
 * Wind range per kite:
 *   min_wind = rider_weight × 2.2 / kite_size
 *   max_wind = min_wind × 1.6
 *
 * Each kite covers roughly 8–12 knots of wind range.
 */
const GLOBAL_MIN_WIND = 12;

function getWindRange(kiteSize, riderWeight, skillLevel, ridingStyle) {
    const minWind = (riderWeight * 2.2) / kiteSize;
    const maxWind = minWind * 1.6;
    return {
        min: Math.max(GLOBAL_MIN_WIND, Math.round(minWind)),
        max: Math.round(maxWind)
    };
}

/**
 * Round a computed kite size to the nearest standard size.
 */
function roundToStandardSize(size) {
    let best = AVAILABLE_KITE_SIZES[0];
    let bestDist = Math.abs(size - best);
    for (let i = 1; i < AVAILABLE_KITE_SIZES.length; i++) {
        const dist = Math.abs(size - AVAILABLE_KITE_SIZES[i]);
        if (dist < bestDist) {
            bestDist = dist;
            best = AVAILABLE_KITE_SIZES[i];
        }
    }
    return best;
}

/**
 * Compute ideal kite size for a given rider weight and wind speed.
 */
function idealKiteSize(riderWeight, windKnots) {
    return (riderWeight / windKnots) * 2.2;
}

/**
 * Get minimum kite size based on rider weight.
 * 70-85 kg: ≥8m², 85-100 kg: ≥9m², >100 kg: no minimum override
 */
function getMinKiteSize(riderWeight) {
    if (riderWeight >= 85 && riderWeight <= 100) return 9;
    if (riderWeight >= 70 && riderWeight < 85) return 8;
    return 5;
}

// ============================================================
// WIND DISTRIBUTION COMPUTATION
// ============================================================

/**
 * Compute the yearly wind speed distribution for a spot.
 * Uses JSON data if loaded, otherwise falls back to Weibull model.
 * Returns an array of { knots, daysPerYear } for each 1-knot bin from 0 to maxKnots.
 */
function computeYearlyWindDistribution(spotKey, maxKnots) {
    if (maxKnots === undefined) maxKnots = 45;

    // Try JSON data first
    const wd = _windDataCache[spotKey];
    if (wd && wd.wind_distribution_annual) {
        const numYears = wd.years_covered ? wd.years_covered.length : 5;
        const bins = bucketsToDailyBins(wd.wind_distribution_annual, numYears, maxKnots);
        const distribution = [];
        for (let v = 0; v <= maxKnots; v++) {
            distribution.push({ knots: v, daysPerYear: bins[v] });
        }
        return distribution;
    }

    // Weibull fallback
    const spot = SPOTS[spotKey];
    if (!spot) return [];
    const distribution = [];
    for (let v = 0; v <= maxKnots; v++) {
        let totalDays = 0;
        for (let m = 0; m < 12; m++) {
            const { k, mean } = spot.windParams[m];
            const lambda = weibullScale(mean, k);
            totalDays += DAYS_IN_MONTH[m] * weibullProbBetween(v, v + 1, k, lambda);
        }
        distribution.push({ knots: v, daysPerYear: totalDays });
    }
    return distribution;
}

// ============================================================
// OPTIMIZATION ENGINE
// ============================================================

/**
 * Compute how many days per year are rideable with a given set of kite sizes.
 * Uses JSON monthly data if available, otherwise Weibull fallback.
 */
function computeRideableDays(kiteSizes, riderWeight, skillLevel, ridingStyle, spotKey) {
    const spot = SPOTS[spotKey];
    if (!spot) return { totalDays: 0, monthlyDays: [], coverageByKnot: [] };

    const ranges = kiteSizes.map(function (s) { return getWindRange(s, riderWeight, skillLevel, ridingStyle); });
    var totalDays = 0;
    var monthlyDays = [];
    var maxKnots = 45;
    var coverageByKnot = new Array(maxKnots + 1).fill(0);

    var wd = _windDataCache[spotKey];
    var useJson = wd && wd.wind_distribution_monthly;

    for (var m = 0; m < 12; m++) {
        var monthRideable = 0;

        if (useJson) {
            var numYears = wd.years_covered ? wd.years_covered.length : 5;
            var monthBuckets = wd.wind_distribution_monthly[String(m + 1)];
            var bins = bucketsToDailyBins(monthBuckets, numYears, maxKnots);
            // bins[v] = days in this month with wind speed v (per year average)
            // But this is annual-averaged monthly days; divide by 1 since bucketsToDailyBins
            // already gives per-year values. However the annual data sums all months.
            // For monthly: we need days in THIS month. The bucket hours are summed over
            // numYears worth of this specific month, so days = hours / numYears / 24 per knot.
            // bucketsToDailyBins already does this, but it gives days-per-year.
            // For a single month, the "days per year" from that month's data IS the
            // average days in that month, because the hours only cover that month.
            for (var v = 0; v <= maxKnots; v++) {
                var inRange = ranges.some(function (r) { return v >= r.min && v <= r.max; });
                if (inRange) {
                    monthRideable += bins[v];
                    coverageByKnot[v] += bins[v];
                }
            }
        } else {
            var params = spot.windParams[m];
            var lambda = weibullScale(params.mean, params.k);
            for (var v = 0; v <= maxKnots; v++) {
                var prob = weibullProbBetween(v, v + 1, params.k, lambda);
                var inRange = ranges.some(function (r) { return v >= r.min && v <= r.max; });
                if (inRange) {
                    monthRideable += DAYS_IN_MONTH[m] * prob;
                    coverageByKnot[v] += DAYS_IN_MONTH[m] * prob;
                }
            }
        }

        monthlyDays.push(monthRideable);
        totalDays += monthRideable;
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
 * Validate spacing rule: each consecutive kite ≈ previous × 1.33 (±1 standard size).
 * Kites are sorted large-to-small (descending), so smaller index = bigger kite.
 * Going from big to small: next size ≈ prev / 1.33 (i.e. smaller kite).
 * Going from small to big: next size ≈ prev * 1.33.
 * We check ascending (small to large).
 */
function hasValidSpacing(kiteSizes) {
    if (kiteSizes.length <= 1) return true;
    var sorted = kiteSizes.slice().sort(function (a, b) { return a - b; });
    for (var i = 0; i < sorted.length - 1; i++) {
        var idealNext = sorted[i] * 1.33;
        var rounded = roundToStandardSize(idealNext);
        // Allow ±1 standard size from the ideal
        var idx = AVAILABLE_KITE_SIZES.indexOf(rounded);
        var allowed = [rounded];
        if (idx > 0) allowed.push(AVAILABLE_KITE_SIZES[idx - 1]);
        if (idx < AVAILABLE_KITE_SIZES.length - 1) allowed.push(AVAILABLE_KITE_SIZES[idx + 1]);
        if (allowed.indexOf(sorted[i + 1]) === -1) return false;
    }
    return true;
}

/**
 * Validate minimum kite size based on rider weight.
 */
function hasValidMinSize(kiteSizes, riderWeight) {
    var minSize = getMinKiteSize(riderWeight);
    for (var i = 0; i < kiteSizes.length; i++) {
        if (kiteSizes[i] < minSize) return false;
    }
    return true;
}

/**
 * Compute max practical kite size for a given rider weight.
 * The largest useful kite is the one whose raw min_wind ≥ GLOBAL_MIN_WIND,
 * i.e. kite_size ≤ weight × 2.2 / GLOBAL_MIN_WIND.
 * Bigger kites get their range capped and become less efficient.
 */
function getMaxPracticalSize(riderWeight) {
    const raw = (riderWeight * 2.2) / GLOBAL_MIN_WIND;
    return roundToStandardSize(raw);
}

/**
 * Find the optimal set of kite sizes that maximizes rideable wind days.
 * Uses brute-force search over all combinations with constraints:
 * - Wind ranges must overlap (no gap > 2 knots)
 * - Spacing rule: next kite ≈ prev × 1.33 (±1 size)
 * - Max practical kite size based on rider weight
 *
 * Tiebreaker: when two combos yield similar rideable days (<0.5 day difference),
 * prefer the combo with the larger smallest kite (more practical quiver).
 */
function optimizeKiteSizes(numKites, riderWeight, skillLevel, ridingStyle, spotKey) {
    const maxSize = getMaxPracticalSize(riderWeight);
    const allowedSizes = AVAILABLE_KITE_SIZES.filter(function (s) { return s <= maxSize; });

    let bestCombo = null;
    let bestScore = -1;
    let bestResult = null;

    for (const combo of combinations(allowedSizes, numKites)) {
        if (!hasValidSpacing(combo)) continue;
        if (!hasValidOverlap(combo, riderWeight, skillLevel, ridingStyle)) continue;
        const result = computeRideableDays(combo, riderWeight, skillLevel, ridingStyle, spotKey);
        // Score: total days + bonus for larger min kite (avoids useless tiny kites)
        const score = result.totalDays + combo[0] * 0.1;
        if (score > bestScore) {
            bestScore = score;
            bestCombo = combo;
            bestResult = result;
        }
    }

    if (!bestCombo) {
        // Fallback: relax spacing constraint, use full size range
        for (const combo of combinations(AVAILABLE_KITE_SIZES, numKites)) {
            if (!hasValidOverlap(combo, riderWeight, skillLevel, ridingStyle)) continue;
            const result = computeRideableDays(combo, riderWeight, skillLevel, ridingStyle, spotKey);
            const score = result.totalDays + combo[0] * 0.1;
            if (score > bestScore) {
                bestScore = score;
                bestCombo = combo;
                bestResult = result;
            }
        }
    }

    return {
        kiteSizes: bestCombo,
        totalRideableDays: Math.round(bestResult.totalDays),
        monthlyRideableDays: bestResult.monthlyDays.map(d => Math.round(d * 10) / 10),
        coverageByKnot: bestResult.coverageByKnot,
        windRanges: bestCombo.map(s => getWindRange(s, riderWeight, skillLevel, ridingStyle)),
        totalDaysInYear: 365
    };
}

// Node.js exports for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
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
        computeRideableDays,
        SPOTS
    };
}
