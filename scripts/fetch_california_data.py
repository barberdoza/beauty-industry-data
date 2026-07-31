#!/usr/bin/env python3
"""
Build data/ca_shops.json from California DCA Board of Barbering and Cosmetology
public license files (tab-delimited exports named *.xls).

Usage:
    python scripts/fetch_california_data.py \\
        ~/Downloads/BarberingAndCosmetology_Data00.xls \\
        ~/Downloads/BarberingAndCosmetology_Data01.xls

No API key required.
"""
import csv
import json
import os
import re
import sys
import urllib.request
import zipfile
import io
from collections import defaultdict
from datetime import datetime, timezone

DEFAULT_PATHS = [
    os.path.expanduser("~/Downloads/BarberingAndCosmetology_Data00.xls"),
    os.path.expanduser("~/Downloads/BarberingAndCosmetology_Data01.xls"),
]

ESTABLISHMENT_TYPES = {"Establishment", "Barber Shop"}
CURRENT_STATUS = {"Current", "Delinquent"}

CATEGORIES = {
    "BARBER": "Barber Shop",
    "ESTABLISHMENT": "Cosmetology / Salon Establishment",
}

PRACTITIONER_MAP = {
    "Barber": "barber",
    "Apprentice Barber": "barber_apprentice",
    "Cosmetologist": "cosmetologist",
    "Apprentice Cosmetologist": "other",
    "Esthetician": "esthetician",
    "Manicurist": "nail_specialist",
    "Electrologist": "other",
    "Hairstylist": "natural_hair",
    "Personal Service Permit": "other",
}

PRACTITIONER_LABELS = {
    "barber": "Barber",
    "barber_apprentice": "Barber apprentice",
    "cosmetologist": "Cosmetologist",
    "esthetician": "Esthetician",
    "nail_specialist": "Manicurist",
    "natural_hair": "Hairstylist",
    "other": "Other / permit",
}

GAZETTEER_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/"
    "2024_Gazetteer/2024_Gaz_place_national.zip"
)


def parse_issue_year(value):
    value = (value or "").strip()
    if not value:
        return None
    match = re.search(r"(20\d{2}|19\d{2})", value)
    return int(match.group(1)) if match else None


def normalize_city(name):
    name = (name or "").strip()
    if not name:
        return "Unknown"
    return name.title()


def classify_establishment(license_type):
    if license_type == "Barber Shop":
        return "BARBER"
    if license_type == "Establishment":
        return "ESTABLISHMENT"
    return None


def fetch_ca_place_centroids():
    req = urllib.request.Request(GAZETTEER_URL, headers={"User-Agent": "ca-shop-directory/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        zip_bytes = resp.read()

    by_lower = {}
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        inner = next(n for n in zf.namelist() if n.lower().endswith(".txt"))
        with zf.open(inner) as f:
            text = io.TextIOWrapper(f, encoding="latin-1")
            reader = csv.DictReader(text, delimiter="\t")
            for row in reader:
                row = {k.strip(): v.strip() for k, v in row.items()}
                if row.get("USPS") != "CA":
                    continue
                name = row["NAME"]
                if name.endswith(" city"):
                    name = name[: -len(" city")]
                elif name.endswith(" town"):
                    name = name[: -len(" town")]
                elif name.endswith(" CDP"):
                    name = name[: -len(" CDP")]
                lat = float(row["INTPTLAT"])
                lon = float(row["INTPTLONG"])
                by_lower[name.lower()] = (lat, lon, name)
    return by_lower


def attach_centroids(rollup):
    centroids = fetch_ca_place_centroids()
    matched = 0
    for row in rollup:
        key = row["city"].lower()
        hit = centroids.get(key)
        if hit:
            row["lat"], row["lon"] = hit[0], hit[1]
            matched += 1
        else:
            row["lat"] = row["lon"] = None
    return matched, len(rollup)


def process_files(paths):
    rollup = defaultdict(lambda: {code: 0 for code in CATEGORIES})
    rollup_status = defaultdict(lambda: {"current": 0, "delinquent": 0})
    shops = []
    practitioner_totals = defaultdict(int)
    practitioner_status = {"current": 0, "delinquent": 0}
    establishment_status = {"current": 0, "delinquent": 0}
    practitioner_growth = defaultdict(lambda: defaultdict(int))
    establishment_growth = defaultdict(lambda: defaultdict(int))
    growth_by_city = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    rows_read = 0

    for path in paths:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f, delimiter="\t")
            for row in reader:
                rows_read += 1
                license_type = (row.get("License Type") or "").strip()
                indiv_org = (row.get("Indiv/Org") or "").strip()
                status = (row.get("License Status") or "").strip()
                if status not in CURRENT_STATUS:
                    continue

                issue_year = parse_issue_year(row.get("Original Issue Date"))
                status_key = "current" if status == "Current" else "delinquent"

                if indiv_org == "O":
                    cat = classify_establishment(license_type)
                    if not cat:
                        continue
                    city = normalize_city(row.get("City"))
                    rollup[city][cat] += 1
                    rollup_status[city][status_key] += 1
                    establishment_status[status_key] += 1
                    name = (row.get("Org/Last Name") or "").strip()
                    county = (row.get("County") or "").strip()
                    zip_code = (row.get("Zip") or "").strip()
                    address = (row.get("Address Line 1") or "").strip()
                    shops.append([name, cat, address, city, county, zip_code, None, None])
                    if issue_year:
                        establishment_growth[issue_year][cat] += 1
                        establishment_growth[issue_year]["total"] += 1
                        growth_by_city[city][issue_year][cat] += 1
                        growth_by_city[city][issue_year]["total"] += 1
                    continue

                if indiv_org == "I":
                    key = PRACTITIONER_MAP.get(license_type)
                    if not key:
                        continue
                    practitioner_totals[key] += 1
                    practitioner_status[status_key] += 1
                    if issue_year:
                        practitioner_growth[issue_year][key] += 1
                        practitioner_growth[issue_year]["total"] += 1

    rollup_out = []
    for city, counts in rollup.items():
        total = sum(counts.values())
        status = rollup_status[city]
        entry = {"city": city, "total": total, **counts, **status}
        rollup_out.append(entry)
    rollup_out.sort(key=lambda r: (-r["total"], r["city"]))

    growth = [
        {"year": year, **dict(establishment_growth[year])}
        for year in sorted(establishment_growth)
    ]
    growth_by_city_out = {
        city: [{"year": year, **dict(years[year])} for year in sorted(years)]
        for city, years in growth_by_city.items()
    }
    prac_growth = [
        {"year": year, **dict(practitioner_growth[year])}
        for year in sorted(practitioner_growth)
    ]

    return {
        "rows_read": rows_read,
        "rollup": rollup_out,
        "shops": shops,
        "practitioner_totals": dict(practitioner_totals),
        "practitioner_growth": prac_growth,
        "growth": growth,
        "growth_by_city": growth_by_city_out,
        "license_status_breakdown": {
            "establishments": {
                **establishment_status,
                "total": establishment_status["current"] + establishment_status["delinquent"],
            },
            "practitioners": {
                **practitioner_status,
                "total": practitioner_status["current"] + practitioner_status["delinquent"],
            },
        },
    }


def main():
    paths = sys.argv[1:] if len(sys.argv) > 1 else DEFAULT_PATHS
    missing = [p for p in paths if not os.path.isfile(p)]
    if missing:
        raise SystemExit(f"Missing input file(s): {missing}")

    print(f"Processing {len(paths)} California DCA file(s)...")
    result = process_files(paths)
    matched, total_cities = attach_centroids(result["rollup"])

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "California Dept. of Consumer Affairs — Board of Barbering and Cosmetology public license data",
        "source_url": "https://www.dca.ca.gov/consumers/complaints/",
        "centroid_source": "U.S. Census Bureau 2024 Gazetteer Files (California places)",
        "is_sample": False,
        "input_files": [os.path.basename(p) for p in paths],
        "rows_read": result["rows_read"],
        "categories": CATEGORIES,
        "practitioner_categories": PRACTITIONER_LABELS,
        "practitioner_totals": result["practitioner_totals"],
        "practitioner_growth": result["practitioner_growth"],
        "practitioner_growth_note": (
            "Practitioner growth uses original issue year among individual licenses with Current or Delinquent status. "
            "California's public export does not include practitioner city or work location for most records."
        ),
        "license_status_note": (
            "Counts include Current and Delinquent licenses, matching the Board's published license counts export. "
            "Delinquent licenses remain on the registry but have unpaid renewal fees."
        ),
        "practitioner_city_note": (
            "City practitioner counts are not available — California's export omits city for nearly all individual licenses."
        ),
        "growth": result["growth"],
        "growth_by_city": result["growth_by_city"],
        "growth_baseline_year": 2014,
        "growth_note": (
            "Establishment counts use organization licenses classified as Barber Shop or Establishment "
            "with Current or Delinquent status, matching the Board's published license counts. "
            "Growth charts use original issue year among those records."
        ),
        "rollup": result["rollup"],
        "shop_count": len(result["shops"]),
        "license_status_breakdown": result["license_status_breakdown"],
        "centroid_match": {"matched": matched, "total_cities": total_cities},
    }

    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "ca_shops.json")
    with open(out_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))

    print(
        f"Wrote {out_path}: {len(result['rollup'])} cities, "
        f"{len(result['shops'])} shops, "
        f"{sum(result['practitioner_totals'].values())} practitioners, "
        f"{matched}/{total_cities} cities with centroids."
    )


if __name__ == "__main__":
    main()
