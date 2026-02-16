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
    }
};

// ============================================================
// KITE WIND RANGE MODEL
// ============================================================

/** Common commercial kite sizes in m² */
const AVAILABLE_KITE_SIZES = [7, 8, 9, 10, 11, 12, 13, 14, 15, 17];

/**
 * Reference wind ranges for an 80 kg rider (knots).
 * Min = minimum wind to get planing, Max = maximum comfortable wind.
 * safetyMax = absolute ceiling — kite becomes unflyable/dangerous beyond this.
 * Based on typical LEI tube kite performance data and manufacturer wind charts.
 *
 * Note: Large kites (15–17 m²) still need ≥12 kn to generate enough pull for
 * planing on a twin-tip. Previous values (8–9 kn min) were unrealistically low
 * and caused the optimizer to always include oversized kites for light-wind days
 * that are not actually rideable.
 */
const REFERENCE_WIND_RANGES = {
    7:  { min: 22, max: 35, safetyMax: 40 },
    8:  { min: 20, max: 32, safetyMax: 37 },
    9:  { min: 18, max: 28, safetyMax: 33 },
    10: { min: 16, max: 25, safetyMax: 30 },
    11: { min: 15, max: 23, safetyMax: 27 },
    12: { min: 14, max: 21, safetyMax: 25 },
    13: { min: 13, max: 20, safetyMax: 23 },
    14: { min: 12, max: 19, safetyMax: 22 },
    15: { min: 12, max: 18, safetyMax: 21 },
    17: { min: 12, max: 17, safetyMax: 20 }
};

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
 * Wind ranges scale with sqrt(weight/80) — heavier riders need more wind.
 * The safetyMax acts as a hard ceiling: large kites become unflyable/dangerous
 * above certain wind speeds regardless of skill level.
 */
function getWindRange(kiteSize, riderWeight, skillLevel, ridingStyle) {
    const ref = REFERENCE_WIND_RANGES[kiteSize];
    if (!ref) return null;
    const weightFactor = Math.sqrt(riderWeight / 80);
    const skill = SKILL_ADJUSTMENTS[skillLevel] || SKILL_ADJUSTMENTS.intermediate;
    const style = STYLE_ADJUSTMENTS[ridingStyle] || STYLE_ADJUSTMENTS.freeride;
    const safetyMax = Math.round(ref.safetyMax * weightFactor);
    return {
        min: Math.max(10, Math.round(ref.min * weightFactor + skill.minAdd + style.minAdd)),
        max: Math.min(safetyMax, Math.round(ref.max * weightFactor + skill.maxAdd + style.maxAdd))
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
 * Find the optimal set of kite sizes that maximizes rideable wind days.
 * Uses brute-force search over all combinations (fast enough for <=13 sizes, <=5 kites).
 */
function optimizeKiteSizes(numKites, riderWeight, skillLevel, ridingStyle, spotKey) {
    let bestCombo = null;
    let bestDays = -1;
    let bestResult = null;

    for (const combo of combinations(AVAILABLE_KITE_SIZES, numKites)) {
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
