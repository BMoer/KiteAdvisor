#!/usr/bin/env python3
"""
Fetch historical wind data from Meteostat for each configured kite spot.
Outputs pre-computed JSON files to public/data/{spot-slug}.json.

Uses the Meteostat Python library (bulk data, no API key needed).

Usage:
    python3 scripts/fetch_wind_data.py              # fetch real data
    python3 scripts/fetch_wind_data.py --synthetic   # generate from Weibull model
"""

import json
import math
import os
import sys
from datetime import datetime

# ── Spot configuration ──────────────────────────────────────────────

SPOTS = [
    {
        "slug": "podersdorf",
        "label": "Podersdorf am Neusiedlersee",
        "lat": 47.86,
        "lon": 16.83,
        # Weibull params per month [shape k, mean kts] for synthetic mode
        "weibull": [
            (1.8, 7), (1.9, 8), (2.0, 9), (2.0, 11), (2.1, 12), (2.1, 11),
            (2.0, 10), (1.9, 9), (2.0, 10), (2.0, 10), (1.9, 8), (1.8, 7),
        ],
    },
    {
        "slug": "tarifa",
        "label": "Tarifa",
        "lat": 36.01,
        "lon": -5.60,
        "weibull": [
            (2.0, 14), (2.0, 14), (2.1, 15), (2.2, 16), (2.3, 18), (2.4, 20),
            (2.5, 22), (2.5, 21), (2.3, 18), (2.1, 15), (2.0, 14), (2.0, 13),
        ],
    },
    {
        "slug": "lo_stagnone",
        "label": "Lo Stagnone (Sizilien)",
        "lat": 37.87,
        "lon": 12.47,
        "weibull": [
            (1.7, 8), (1.8, 9), (2.0, 11), (2.2, 14), (2.4, 16), (2.5, 18),
            (2.6, 19), (2.5, 18), (2.3, 15), (2.0, 12), (1.8, 9), (1.7, 8),
        ],
    },
    {
        "slug": "hamata",
        "label": "Hamata",
        "lat": 24.33,
        "lon": 35.32,
        "weibull": [
            (2.2, 14), (2.3, 15), (2.5, 17), (2.7, 19), (2.9, 21), (3.0, 22),
            (3.1, 23), (3.0, 22), (2.8, 20), (2.5, 17), (2.3, 15), (2.2, 14),
        ],
    },
]

# ── Parameters ──────────────────────────────────────────────────────

YEARS_BACK = 5
KMH_TO_KTS = 1.852
MAX_KNOT = 45
DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def wind_bin_edges():
    """Return list of 1-knot bins [(0,1), (1,2), ..., (MAX_KNOT, MAX_KNOT+1)]."""
    return [(kts, kts + 1) for kts in range(0, MAX_KNOT + 1)]


# ── Weibull helpers for synthetic mode ──────────────────────────────

def _gamma(z):
    """Lanczos approximation of the Gamma function."""
    if z < 0.5:
        return math.pi / (math.sin(math.pi * z) * _gamma(1 - z))
    z -= 1
    g = 7
    c = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028,
        771.32342877765313, -176.61502916214059, 12.507343278686905,
        -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ]
    x = c[0]
    for i in range(1, g + 2):
        x += c[i] / (z + i)
    t = z + g + 0.5
    return math.sqrt(2 * math.pi) * (t ** (z + 0.5)) * math.exp(-t) * x


def weibull_scale(mean, shape):
    return mean / _gamma(1 + 1 / shape)


def weibull_cdf(v, shape, scale):
    if v <= 0:
        return 0
    return 1 - math.exp(-((v / scale) ** shape))


def weibull_prob_between(v_min, v_max, shape, scale):
    return weibull_cdf(v_max, shape, scale) - weibull_cdf(v_min, shape, scale)


def generate_synthetic(spot):
    """Generate wind distribution JSON from Weibull parameters."""
    slug = spot["slug"]
    label = spot["label"]
    lat, lon = spot["lat"], spot["lon"]
    weibull = spot["weibull"]

    print(f"\n  {label} (synthetic from Weibull model)")

    now = datetime.now()
    years_covered = list(range(now.year - YEARS_BACK, now.year))
    total_hours_per_year = sum(d * 24 for d in DAYS_IN_MONTH)
    total_hours = total_hours_per_year * YEARS_BACK

    bins = wind_bin_edges()

    # Annual distribution: sum across all months
    wind_annual = []
    for lo, hi in bins:
        hours = 0
        for m in range(12):
            k, mean = weibull[m]
            lam = weibull_scale(mean, k)
            prob = weibull_prob_between(lo, hi, k, lam)
            hours += DAYS_IN_MONTH[m] * 24 * prob * YEARS_BACK
        wind_annual.append({
            "min_kts": lo,
            "max_kts": hi,
            "hours": round(hours),
        })

    # Monthly distribution
    wind_monthly = {}
    for m in range(12):
        k, mean = weibull[m]
        lam = weibull_scale(mean, k)
        month_buckets = []
        for lo, hi in bins:
            prob = weibull_prob_between(lo, hi, k, lam)
            hours = DAYS_IN_MONTH[m] * 24 * prob * YEARS_BACK
            month_buckets.append({
                "min_kts": lo,
                "max_kts": hi,
                "hours": round(hours),
            })
        wind_monthly[str(m + 1)] = month_buckets

    rideable = sum(b["hours"] for b in wind_annual if b["min_kts"] >= 10)
    print(f"  Total hours: {total_hours}, rideable (>=10kts): {rideable}")

    return {
        "spot": slug,
        "label": label,
        "lat": lat,
        "lon": lon,
        "station_id": "synthetic",
        "station_name": "Weibull model (synthetic)",
        "station_distance_km": 0,
        "years_covered": years_covered,
        "total_hours": total_hours,
        "missing_pct": 0,
        "wind_distribution_annual": wind_annual,
        "wind_distribution_monthly": wind_monthly,
    }


# ── Meteostat fetch (real data) ────────────────────────────────────

def haversine_km(lat1, lon1, lat2, lon2):
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return 6371 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def fetch_real(spot):
    """Fetch wind data from Meteostat for a single spot."""
    try:
        import meteostat as ms
    except ImportError:
        print("  ERROR: meteostat not installed. Run: pip install meteostat")
        return None
    try:
        import certifi
        os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    except Exception:
        pass
    ms.config.block_large_requests = False

    slug = spot["slug"]
    label = spot["label"]
    lat, lon = spot["lat"], spot["lon"]

    print(f"\n  {label} ({lat}, {lon})")

    now = datetime.now()
    end = datetime(now.year, 1, 1)
    start = datetime(end.year - YEARS_BACK, 1, 1)

    # Find nearest station
    stations_db = ms.stations.nearby(ms.Point(lat, lon))
    if hasattr(stations_db, "fetch"):
        nearby = stations_db.fetch(5)
    else:
        nearby = stations_db.head(5)
    if nearby is None or nearby.empty:
        print(f"  WARNING: No station found, skipping.")
        return None

    station_id = nearby.index[0]
    best = nearby.iloc[0]
    station_name = best.get("name", "Unknown")
    station_dist = round(haversine_km(lat, lon, best["latitude"], best["longitude"]), 1)

    print(f"  Station: {station_name} ({station_id}), {station_dist} km away")
    print(f"  Period: {start.date()} to {end.date()}")

    # Fetch hourly data via selected station ID (point-based hourly can return empty)
    ts = ms.hourly(str(station_id), start, end)
    data = ts.fetch()

    if data is None or data.empty:
        print(f"  WARNING: No hourly data returned, skipping.")
        return None

    total_hours_expected = YEARS_BACK * 365.25 * 24
    wind_rows = data["wspd"].notna().sum()
    missing_pct = round((1 - wind_rows / total_hours_expected) * 100, 1)

    print(f"  Rows: {len(data)}, with wind: {wind_rows}, missing: {missing_pct}%")

    # Convert km/h → knots
    data["wind_kts"] = data["wspd"] / KMH_TO_KTS

    years_covered = sorted(data.index.year.unique().tolist())

    bins = wind_bin_edges()

    # Annual distribution
    wind_annual = []
    for lo, hi in bins:
        count = int(((data["wind_kts"] >= lo) & (data["wind_kts"] < hi)).sum())
        wind_annual.append({"min_kts": lo, "max_kts": hi, "hours": count})

    # Monthly distribution
    wind_monthly = {}
    for month in range(1, 13):
        month_data = data[data.index.month == month]
        month_buckets = []
        for lo, hi in bins:
            count = int(((month_data["wind_kts"] >= lo) & (month_data["wind_kts"] < hi)).sum())
            month_buckets.append({"min_kts": lo, "max_kts": hi, "hours": count})
        wind_monthly[str(month)] = month_buckets

    rideable = sum(b["hours"] for b in wind_annual if b["min_kts"] >= 10)
    print(f"  Total wind hours: {wind_rows}, rideable (>=10kts): {rideable}")

    return {
        "spot": slug,
        "label": label,
        "lat": lat,
        "lon": lon,
        "station_id": str(station_id),
        "station_name": station_name,
        "station_distance_km": station_dist,
        "years_covered": years_covered,
        "total_hours": int(wind_rows),
        "missing_pct": missing_pct,
        "wind_distribution_annual": wind_annual,
        "wind_distribution_monthly": wind_monthly,
    }


# ── Main ────────────────────────────────────────────────────────────

def main():
    synthetic = "--synthetic" in sys.argv
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    mode = "SYNTHETIC (Weibull)" if synthetic else "METEOSTAT (real data)"
    print(f"Kite Advisor — Wind Data Fetch [{mode}]")
    print(f"Output: {os.path.abspath(OUTPUT_DIR)}")

    results = []
    for spot in SPOTS:
        out_path = os.path.join(OUTPUT_DIR, f"{spot['slug']}.json")
        result = generate_synthetic(spot) if synthetic else fetch_real(spot)
        if result is None:
            print(f"  SKIPPED: {spot['label']}")
            if not synthetic and os.path.exists(out_path):
                os.remove(out_path)
                print(f"  Removed stale file: {out_path}")
            continue

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"  Written: {out_path}")
        results.append(result)

    print(f"\nDone. {len(results)}/{len(SPOTS)} spots processed.")


if __name__ == "__main__":
    main()
