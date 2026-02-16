/**
 * Kite Size Optimizer Engine
 * Wind data modeling (Weibull distributions) and kite size optimization algorithm.
 * Branded for Moerzinger.eu (www.moerzinger.eu)
 */

// ============================================================
// MATH HELPERS
// ============================================================

/** Lanczos approximation of the Gamma function */
function gamma(z) {
    if (z < 0.5) {
        return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    }
    z -= 1;
    const g = 7;
    const c = [
        0.99999999999980993,
        676.5203681218851,
        -1259.1392167224028,
        771.32342877765313,
        -176.61502916214059,
        12.507343278686905,
        -0.13857109526572012,
        9.9843695780195716e-6,
        1.5056327351493116e-7
    ];
    let x = c[0];
    for (let i = 1; i < g + 2; i++) {
        x += c[i] / (z + i);
    }
    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

/** Weibull scale parameter from mean and shape */
function weibullScale(mean, shape) {
    return mean / gamma(1 + 1 / shape);
}

/** Weibull CDF: P(V <= v) */
function weibullCDF(v, shape, scale) {
    if (v <= 0) return 0;
    return 1 - Math.exp(-Math.pow(v / scale, shape));
}

/** Probability that wind speed is between vMin and vMax */
function weibullProbBetween(vMin, vMax, shape, scale) {
    return weibullCDF(vMax, shape, scale) - weibullCDF(vMin, shape, scale);
}

// ============================================================
// SPOT DATA — Weibull parameters per month [shape k, mean knots]
// Based on historical weather station data analysis
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
        // Weibull parameters: shape k, mean wind speed (knots)
        // Derived from Windfinder/Weather Atlas historical observations
        // Average wind 6-9 kts (24h), daytime means ~8-12 kts
        windParams: [
            { k: 1.8, mean: 7 },   // Jan
            { k: 1.9, mean: 8 },   // Feb
            { k: 2.0, mean: 9 },   // Mar
            { k: 2.0, mean: 11 },  // Apr
            { k: 2.1, mean: 12 },  // May
            { k: 2.1, mean: 11 },  // Jun
            { k: 2.0, mean: 10 },  // Jul
            { k: 1.9, mean: 9 },   // Aug
            { k: 2.0, mean: 10 },  // Sep
            { k: 2.0, mean: 10 },  // Oct
            { k: 1.9, mean: 8 },   // Nov
            { k: 1.8, mean: 7 }    // Dec
        ]
    },
    tarifa: {
        name: 'Tarifa',
        country: 'Spanien',
        flag: '\u{1F1EA}\u{1F1F8}',
        description: 'Einer der windigsten Spots Europas. Levante (Ost) und Poniente (West) Winde sorgen f\u00fcr zuverl\u00e4ssigen Wind fast das ganze Jahr. Hauptsaison Mai\u2013September mit starkem, konstantem Wind.',
        windParams: [
            { k: 2.0, mean: 14 },  // Jan
            { k: 2.0, mean: 14 },  // Feb
            { k: 2.1, mean: 15 },  // Mar
            { k: 2.2, mean: 16 },  // Apr
            { k: 2.3, mean: 18 },  // May
            { k: 2.4, mean: 20 },  // Jun
            { k: 2.5, mean: 22 },  // Jul
            { k: 2.5, mean: 21 },  // Aug
            { k: 2.3, mean: 18 },  // Sep
            { k: 2.1, mean: 15 },  // Oct
            { k: 2.0, mean: 14 },  // Nov
            { k: 2.0, mean: 13 }   // Dec
        ]
    },
    lo_stagnone: {
        name: 'Lo Stagnone',
        country: 'Sizilien, Italien',
        flag: '\u{1F1EE}\u{1F1F9}',
        description: 'Flache Lagune mit konstantem Thermalwind. Saison April\u2013Oktober. Stehtiefes, warmes Wasser \u2013 ideal f\u00fcr Einsteiger und Fortgeschrittene. Maestrale und Scirocco als Hauptwindrichtungen.',
        windParams: [
            { k: 1.7, mean: 8 },   // Jan
            { k: 1.8, mean: 9 },   // Feb
            { k: 2.0, mean: 11 },  // Mar
            { k: 2.2, mean: 14 },  // Apr
            { k: 2.4, mean: 16 },  // May
            { k: 2.5, mean: 18 },  // Jun
            { k: 2.6, mean: 19 },  // Jul
            { k: 2.5, mean: 18 },  // Aug
            { k: 2.3, mean: 15 },  // Sep
            { k: 2.0, mean: 12 },  // Oct
            { k: 1.8, mean: 9 },   // Nov
            { k: 1.7, mean: 8 }    // Dec
        ]
    },
    hamata: {
        name: 'Hamata',
        country: '\u00c4gypten',
        flag: '\u{1F1EA}\u{1F1EC}',
        description: 'Premium-Spot am s\u00fcdlichen Roten Meer. Zuverl\u00e4ssiger thermischer Nordwind (Shamal) von M\u00e4rz bis November. Flachwasser-Lagune mit t\u00fcrkisem Wasser, konstante Side-Onshore-Bedingungen. Einer der windsichersten Spots weltweit.',
        // Weibull parameters derived from Red Sea / Marsa Alam region weather data
        // Hamata benefits from strong thermal acceleration along the coast
        // Peak season May–Sep with very consistent 18–25 kts
        windParams: [
            { k: 2.2, mean: 14 },  // Jan — moderate, occasional cold fronts
            { k: 2.3, mean: 15 },  // Feb — picking up
            { k: 2.5, mean: 17 },  // Mar — season starts, thermal builds
            { k: 2.7, mean: 19 },  // Apr — reliable thermal
            { k: 2.9, mean: 21 },  // May — strong & consistent
            { k: 3.0, mean: 22 },  // Jun — peak season
            { k: 3.1, mean: 23 },  // Jul — peak, very consistent
            { k: 3.0, mean: 22 },  // Aug — peak season
            { k: 2.8, mean: 20 },  // Sep — still strong
            { k: 2.5, mean: 17 },  // Oct — winding down
            { k: 2.3, mean: 15 },  // Nov — moderate
            { k: 2.2, mean: 14 }   // Dec — lightest month
        ]
    }
};

// ============================================================
// KITE WIND RANGE MODEL
// ============================================================

/** Standard commercial kite sizes in m² */
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
 *
 * Example 80 kg / 12 m²: ideal = 14.7 kn → range 12–20 kn
 */
const WIND_RANGE_MIN_FACTOR = 0.80;
const WIND_RANGE_MAX_FACTOR = 1.33;
const WIND_RANGE_SAFETY_FACTOR = 1.55;
const GLOBAL_MIN_WIND = 10;

/** Skill level adjustments (knots added to min/max) */
const SKILL_ADJUSTMENTS = {
    beginner:     { minAdd: 2,  maxAdd: -3 },
    intermediate: { minAdd: 1,  maxAdd: -1 },
    advanced:     { minAdd: 0,  maxAdd: 0 },
    expert:       { minAdd: -1, maxAdd: 1 }
};

/** Riding style adjustments (knots added to min/max) */
const STYLE_ADJUSTMENTS = {
    freeride:  { minAdd: 0, maxAdd: 0 },
    freestyle: { minAdd: 1, maxAdd: -1 },
    bigair:    { minAdd: 1, maxAdd: 2 }
};

/**
 * Compute the effective wind range for a kite given rider parameters.
 * Uses the industry-standard weight/wind formula to derive ranges
 * dynamically instead of a static lookup table.
 */
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
 * Returns an array of { knots, daysPerYear } for each 1-knot bin from 0 to maxKnots.
 */
function computeYearlyWindDistribution(spotKey, maxKnots = 45) {
    const spot = SPOTS[spotKey];
    if (!spot) return [];
    const distribution = [];
    for (let v = 0; v <= maxKnots; v++) {
        let totalDays = 0;
        for (let m = 0; m < 12; m++) {
            const { k, mean } = spot.windParams[m];
            const lambda = weibullScale(mean, k);
            const prob = weibullProbBetween(v, v + 1, k, lambda);
            totalDays += DAYS_IN_MONTH[m] * prob;
        }
        distribution.push({ knots: v, daysPerYear: totalDays });
    }
    return distribution;
}

/**
 * Compute monthly wind speed distribution for a spot.
 * Returns a 2D array: [month][knot] = days in that month with that wind speed.
 */
function computeMonthlyWindDistribution(spotKey, maxKnots = 45) {
    const spot = SPOTS[spotKey];
    if (!spot) return [];
    const monthly = [];
    for (let m = 0; m < 12; m++) {
        const { k, mean } = spot.windParams[m];
        const lambda = weibullScale(mean, k);
        const monthDist = [];
        for (let v = 0; v <= maxKnots; v++) {
            const prob = weibullProbBetween(v, v + 1, k, lambda);
            monthDist.push(DAYS_IN_MONTH[m] * prob);
        }
        monthly.push(monthDist);
    }
    return monthly;
}

// ============================================================
// OPTIMIZATION ENGINE
// ============================================================

/**
 * Compute how many days per year are rideable with a given set of kite sizes.
 * A day is rideable if the wind speed falls within the range of at least one kite.
 */
function computeRideableDays(kiteSizes, riderWeight, skillLevel, ridingStyle, spotKey) {
    const spot = SPOTS[spotKey];
    if (!spot) return { totalDays: 0, monthlyDays: [], coverageByKnot: [] };

    const ranges = kiteSizes.map(s => getWindRange(s, riderWeight, skillLevel, ridingStyle));
    let totalDays = 0;
    const monthlyDays = [];
    const maxKnots = 45;
    const coverageByKnot = new Array(maxKnots + 1).fill(0);

    for (let m = 0; m < 12; m++) {
        const { k, mean } = spot.windParams[m];
        const lambda = weibullScale(mean, k);
        let monthRideable = 0;

        for (let v = 0; v <= maxKnots; v++) {
            const prob = weibullProbBetween(v, v + 1, k, lambda);
            const inRange = ranges.some(r => v >= r.min && v <= r.max);
            if (inRange) {
                monthRideable += DAYS_IN_MONTH[m] * prob;
                coverageByKnot[v] += DAYS_IN_MONTH[m] * prob;
            }
        }

        monthlyDays.push(monthRideable);
        totalDays += monthRideable;
    }

    return { totalDays, monthlyDays, coverageByKnot };
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
 * Kites sorted by size descending (= wind range ascending).
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
 * Fast enough for <=12 sizes, <=5 kites (max 792 combos).
 */
function optimizeKiteSizes(numKites, riderWeight, skillLevel, ridingStyle, spotKey) {
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

    return {
        kiteSizes: bestCombo,
        totalRideableDays: Math.round(bestDays),
        monthlyRideableDays: bestResult.monthlyDays.map(d => Math.round(d * 10) / 10),
        coverageByKnot: bestResult.coverageByKnot,
        windRanges: bestCombo.map(s => getWindRange(s, riderWeight, skillLevel, ridingStyle)),
        totalDaysInYear: 365
    };
}
