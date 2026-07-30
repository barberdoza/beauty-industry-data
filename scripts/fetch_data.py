#!/usr/bin/env python3
"""
Pulls active Appearance Enhancement Business & Barber Shop license records
from New York State's open data portal (data.ny.gov, Socrata) and writes a
compact JSON file with:
  - a city-level rollup (shop counts by category)
  - individual shop records with lat/lon, for the map

No API key is required for this volume of traffic. If you hit rate limits,
get a free Socrata "app token" at https://data.ny.gov/profile/edit/developer_settings
and set it via the NY_APP_TOKEN environment variable -- the script will pick
it up automatically.

Usage:
    python scripts/fetch_data.py
"""
import json
import os
import re
import sys
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone

# "Active Appearance Enhancement and Barber Business and Area Renter Licensees"
# https://data.ny.gov/Economic-Development/Active-Appearance-Enhancement-and-Barber-Business-/y3u4-jbgh
RESOURCE_ID = "y3u4-jbgh"
BASE_URL = f"https://data.ny.gov/resource/{RESOURCE_ID}.json"

# Only these license types represent an actual shop location. Area Renters
# (independent contractors who rent a chair/space inside someone else's
# shop) share their address with the shop they rent from, so counting them
# as separate "shops" would double-count locations -- they're tallied
# separately instead, in case you want to know renter density per shop.
SHOP_CATEGORIES = {
    "DOSAEBUSINESS": "Appearance Enhancement Business",
    "DOSBARSHOPOWNER": "Barber Shop",
}

# "Active Appearance Enhancement and Barber Individual Licenses"
# https://data.ny.gov/Economic-Development/Active-Appearance-Enhancement-and-Barber-Individua/ucu3-8265
INDIVIDUAL_RESOURCE_ID = "ucu3-8265"
INDIVIDUAL_BASE_URL = f"https://data.ny.gov/resource/{INDIVIDUAL_RESOURCE_ID}.json"

# Maps NY registry license_type strings to compact dashboard keys.
PRACTITIONER_CATEGORIES = {
    "Barber - Operator": "barber",
    "Barber - Apprentice": "barber_apprentice",
    "Appearance Enhancement Operator - Cosmetology": "cosmetologist",
    "Appearance Enhancement Operator - Esthetics": "esthetician",
    "Appearance Enhancement Operator - Nail Specialty": "nail_specialist",
    "Appearance Enhancement Operator - Waxing": "waxing",
    "Appearance Enhancement Operator - Natural Hair Styling": "natural_hair",
    "Appearance Enhancement Operator - Cosmetology (Temporary)": "other",
    "Appearance Enhancement Operator - Esthetics (Temporary)": "other",
    "Appearance Enhancement Operator - Nail Specialty (Temporary)": "other",
    "Appearance Enhancement Operator - Waxing (Temporary)": "other",
    "Appearance Enhancement Operator - Natural Hair Styling  (Temporary)": "other",
    "Appearance Enhancement - Nail Specialty Trainee": "other",
}

PRACTITIONER_LABELS = {
    "barber": "Barber",
    "barber_apprentice": "Barber apprentice",
    "cosmetologist": "Cosmetologist",
    "esthetician": "Esthetician",
    "nail_specialist": "Nail specialist",
    "waxing": "Waxing",
    "natural_hair": "Natural hair styling",
    "other": "Trainee / temporary",
}

PAGE_SIZE = 5000


def _get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "ny-shop-directory/1.0"})
    app_token = os.environ.get("NY_APP_TOKEN")
    if app_token:
        req.add_header("X-App-Token", app_token)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="ignore")
        raise RuntimeError(f"NY open data request failed: {e.code} {body[:300]} ({url})")


def parse_point(georeference):
    """Socrata Point columns usually arrive as GeoJSON: {"type":"Point","coordinates":[lon,lat]}.
    Fall back to parsing WKT-style "POINT (lon lat)" strings just in case."""
    if not georeference:
        return None
    if isinstance(georeference, dict):
        coords = georeference.get("coordinates")
        if coords and len(coords) == 2:
            lon, lat = coords
            return (lat, lon)
        return None
    if isinstance(georeference, str):
        m = re.match(r"POINT\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)", georeference)
        if m:
            lon, lat = float(m.group(1)), float(m.group(2))
            return (lat, lon)
    return None


def parse_issue_year(issue_date):
    """license_issue_date arrives as MM/DD/YYYY from Socrata."""
    if not issue_date:
        return None
    match = re.search(r"(\d{4})$", str(issue_date))
    return int(match.group(1)) if match else None


def parse_license_number_year(license_number):
    """Infer issue year from dash-format NY license numbers only.

    Legacy compact numbers (e.g. 22FI..., 16BR...) use batch prefixes from
    registry migrations, not issue years — those are excluded from growth."""
    if not license_number:
        return None
    number = str(license_number)
    current_year = datetime.now(timezone.utc).year

    dash_patterns = (
        r"^[A-Z]{2,5}-(\d{2})-",
        r"-T-(\d{2})-",
        r"^AENHS-(\d{2})-",
    )
    for pattern in dash_patterns:
        match = re.search(pattern, number)
        if match:
            year = 2000 + int(match.group(1))
            return year if year <= current_year else None

    return None


def fetch_paginated(base_url, fields):
    records = []
    offset = 0
    while True:
        url = base_url + "?" + urllib.parse.urlencode({
            "$select": fields,
            "$limit": PAGE_SIZE,
            "$offset": offset,
            "$order": ":id",
        })
        batch = _get_json(url)
        if not batch:
            break
        records.extend(batch)
        print(f"  fetched {len(records)} records so far...")
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return records


def fetch_all_records():
    fields = (
        "license_type,business_name,business_address_1,business_address_2,"
        "business_city,business_zip,georeference,license_issue_date"
    )
    return fetch_paginated(BASE_URL, fields)


def fetch_individual_records():
    fields = "license_type,license_number"
    return fetch_paginated(INDIVIDUAL_BASE_URL, fields)


def build_practitioner_stats(raw_individual):
    totals = {key: 0 for key in PRACTITIONER_LABELS}
    growth = {}
    skipped = 0

    def bump(bucket, category_key):
        bucket.setdefault(category_key, 0)
        bucket[category_key] += 1
        bucket["total"] = bucket.get("total", 0) + 1

    for row in raw_individual:
        license_type = row.get("license_type")
        category_key = PRACTITIONER_CATEGORIES.get(license_type)
        if not category_key:
            skipped += 1
            continue

        totals[category_key] += 1
        issue_year = parse_license_number_year(row.get("license_number"))
        if issue_year is not None:
            bump(growth.setdefault(issue_year, {key: 0 for key in PRACTITIONER_LABELS}), category_key)

    growth_rows = []
    for year in sorted(growth):
        counts = growth[year]
        entry = {"year": year, "total": counts.get("total", 0)}
        entry.update({key: counts.get(key, 0) for key in PRACTITIONER_LABELS})
        growth_rows.append(entry)

    return totals, growth_rows, skipped


BARBER_PRACTITIONER_KEYS = ("barber", "barber_apprentice")
AEB_PRACTITIONER_KEYS = ("cosmetologist", "esthetician", "nail_specialist", "waxing", "natural_hair", "other")
RENTER_TYPES = {
    "DOSAERENTER": "appearance_renter",
    "DOSBARRENTER": "barber_renter",
}


def build_practitioner_city_estimates(rollup_out, practitioner_totals):
    """Estimate city-level practitioner counts from local shop share.

    NY open data does not publish practitioner cities. Barbers are allocated
    from each city's barbershop share; all other specialties from appearance
    business share."""
    state_barber_shops = sum(r.get("DOSBARSHOPOWNER", 0) for r in rollup_out) or 1
    state_aeb = sum(r.get("DOSAEBUSINESS", 0) for r in rollup_out) or 1

    estimates = []
    for row in rollup_out:
        barber_shops = row.get("DOSBARSHOPOWNER", 0)
        aeb = row.get("DOSAEBUSINESS", 0)
        entry = {"city": row["city"]}
        for key in BARBER_PRACTITIONER_KEYS:
            entry[key] = round((barber_shops / state_barber_shops) * practitioner_totals.get(key, 0))
        for key in AEB_PRACTITIONER_KEYS:
            entry[key] = round((aeb / state_aeb) * practitioner_totals.get(key, 0))
        entry["total"] = sum(entry[key] for key in BARBER_PRACTITIONER_KEYS + AEB_PRACTITIONER_KEYS)
        estimates.append(entry)

    estimates.sort(key=lambda r: -r["total"])
    return estimates


def main():
    print("Fetching active NY appearance enhancement & barber licenses...")
    raw = fetch_all_records()
    print(f"Total records pulled: {len(raw)}")

    shops = []
    rollup = {}  # city -> {category_code: count, "total": n}
    growth = {}  # year -> {category_code: count, "total": n}
    growth_by_city = {}  # city -> year -> {category_code: count, "total": n}
    renter_by_city = {}  # city -> {appearance_renter, barber_renter, total}
    other_type_count = 0

    def bump_growth(bucket, license_type):
        bucket.setdefault(license_type, 0)
        bucket[license_type] += 1
        bucket["total"] = bucket.get("total", 0) + 1

    for row in raw:
        license_type = row.get("license_type")
        city = (row.get("business_city") or "UNKNOWN").strip().upper()
        city_title = city.title()

        if license_type in RENTER_TYPES:
            renter_key = RENTER_TYPES[license_type]
            bucket = renter_by_city.setdefault(
                city_title,
                {"appearance_renter": 0, "barber_renter": 0, "total": 0},
            )
            bucket[renter_key] += 1
            bucket["total"] += 1
            other_type_count += 1
            continue

        if license_type not in SHOP_CATEGORIES:
            other_type_count += 1
            continue

        point = parse_point(row.get("georeference"))
        lat, lon = point if point else (None, None)
        issue_year = parse_issue_year(row.get("license_issue_date"))

        addr = " ".join(filter(None, [row.get("business_address_1"), row.get("business_address_2")]))

        shops.append([
            row.get("business_name") or "",
            license_type,
            addr,
            city_title,
            row.get("business_zip") or "",
            lat,
            lon,
            issue_year,
        ])

        bucket = rollup.setdefault(city_title, {code: 0 for code in SHOP_CATEGORIES})
        bucket[license_type] += 1

        if issue_year is not None:
            bump_growth(growth.setdefault(issue_year, {code: 0 for code in SHOP_CATEGORIES}), license_type)
            city_growth = growth_by_city.setdefault(city_title, {})
            bump_growth(city_growth.setdefault(issue_year, {code: 0 for code in SHOP_CATEGORIES}), license_type)

    rollup_out = []
    for city, counts in sorted(rollup.items()):
        total = sum(counts.values())
        entry = {"city": city, "total": total}
        entry.update(counts)
        rollup_out.append(entry)
    rollup_out.sort(key=lambda r: -r["total"])

    def growth_rows(source):
        rows = []
        for year in sorted(source):
            counts = source[year]
            entry = {"year": year, "total": counts.get("total", 0)}
            entry.update({code: counts.get(code, 0) for code in SHOP_CATEGORIES})
            rows.append(entry)
        return rows

    growth_by_city_out = {
        city: growth_rows(years)
        for city, years in sorted(growth_by_city.items())
    }

    print("Fetching active NY individual practitioner licenses...")
    raw_individual = fetch_individual_records()
    print(f"Total individual records pulled: {len(raw_individual)}")
    practitioner_totals, practitioner_growth, practitioner_skipped = build_practitioner_stats(raw_individual)
    practitioner_city_estimates = build_practitioner_city_estimates(rollup_out, practitioner_totals)

    renter_rollup = [
        {"city": city, **counts}
        for city, counts in sorted(renter_by_city.items(), key=lambda item: -item[1]["total"])
    ]

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "New York State Department of State via data.ny.gov (Socrata Open Data)",
        "source_url": f"https://data.ny.gov/Economic-Development/Active-Appearance-Enhancement-and-Barber-Business-/{RESOURCE_ID}",
        "individual_source_url": f"https://data.ny.gov/Economic-Development/Active-Appearance-Enhancement-and-Barber-Individua/{INDIVIDUAL_RESOURCE_ID}",
        "is_sample": False,
        "categories": SHOP_CATEGORIES,
        "practitioner_categories": PRACTITIONER_LABELS,
        "practitioner_totals": practitioner_totals,
        "practitioner_growth": practitioner_growth,
        "practitioner_city_estimates": practitioner_city_estimates,
        "practitioner_city_note": (
            "City practitioner counts are estimates. NY open data does not publish practitioner "
            "home or work cities for individual licenses. Barbers and apprentices are allocated "
            "from each city's share of barbershops; cosmetologists, estheticians, nail specialists, "
            "and related specialties from each city's share of appearance enhancement businesses."
        ),
        "renter_by_city": renter_rollup,
        "renter_note": (
            "Area renters are the only individual licensees with a published work city in NY open "
            "data (~5,000 active chair/space renters). They are not broken down by specialty."
        ),
        "practitioner_growth_note": (
            "Individual license counts are statewide. NY open data does not include city for "
            "practitioner records. Growth years use dash-format license numbers only "
            "(e.g. AEC-24-, BO-23-). Legacy batch numbers (e.g. 22FI..., 16BR...) are "
            "registry migration codes, not issue years — they appear in active totals but "
            "not in growth charts."
        ),
        "excluded_area_renter_records": other_type_count,
        "excluded_practitioner_records": practitioner_skipped,
        "shop_fields": ["name", "category", "address", "city", "zip", "lat", "lon", "issue_year"],
        "growth_note": (
            "New licenses are grouped by original license issue year among currently active "
            "shop locations. 2014 reflects a registry baseline, not a single year's openings."
        ),
        "growth_baseline_year": 2014,
        "growth": growth_rows(growth),
        "growth_by_city": growth_by_city_out,
        "rollup": rollup_out,
        "shops": shops,
    }

    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "ny_shops.json")
    with open(out_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))  # compact -- this dataset is large

    print(f"Wrote {out_path}: {len(shops)} shops across {len(rollup_out)} cities "
          f"({other_type_count} area-renter records excluded from shop counts).")
    print(f"Practitioner totals: {sum(practitioner_totals.values())} active individual licenses "
          f"({practitioner_skipped} unmapped records skipped).")


if __name__ == "__main__":
    main()
