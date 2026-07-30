#!/usr/bin/env python3
"""Add county centroids to data/il_shops.json from the Census Gazetteer."""
import csv
import io
import json
import os
import urllib.request
import zipfile

GAZETTEER_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/"
    "2024_Gazetteer/2024_Gaz_counties_national.zip"
)
DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "il_shops.json")

ALIASES = {
    "dupage": "DuPage",
    "mchenry": "McHenry",
    "mclean": "McLean",
    "mcdonough": "McDonough",
    "dekalb": "DeKalb",
    "saint clair": "St. Clair",
    "st clair": "St. Clair",
    "jo daviess": "Jo Daviess",
    "de witt": "De Witt",
    "la salle": "LaSalle",
}


def fetch_centroids():
    req = urllib.request.Request(GAZETTEER_URL, headers={"User-Agent": "il-shop-directory/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        zip_bytes = resp.read()

    by_lower = {}
    by_name = {}
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        inner_name = next(n for n in zf.namelist() if n.lower().endswith(".txt"))
        with zf.open(inner_name) as f:
            text = io.TextIOWrapper(f, encoding="latin-1")
            reader = csv.DictReader(text, delimiter="\t")
            for row in reader:
                row = {k.strip(): v.strip() for k, v in row.items()}
                if row.get("USPS") != "IL":
                    continue
                name = row["NAME"].removesuffix(" County")
                lat = float(row["INTPTLAT"])
                lon = float(row["INTPTLONG"])
                by_name[name] = (lat, lon)
                by_lower[name.lower()] = (lat, lon)
    return by_name, by_lower


def resolve_county(name, by_name, by_lower):
    if name in by_name:
        return by_name[name]
    alias = ALIASES.get(name.lower())
    if alias and alias in by_name:
        return by_name[alias]
    return by_lower.get(name.lower())


def main():
    with open(DATA_PATH) as f:
        data = json.load(f)

    by_name, by_lower = fetch_centroids()
    matched = 0
    for row in data["rollup"]:
        centroid = resolve_county(row["county"], by_name, by_lower)
        if centroid:
            row["lat"], row["lon"] = centroid
            matched += 1
        else:
            row["lat"] = None
            row["lon"] = None

    data["centroid_source"] = "U.S. Census Bureau 2024 Gazetteer Files"
    with open(DATA_PATH, "w") as f:
        json.dump(data, f, separators=(",", ":"))

    print(f"Updated {matched}/{len(data['rollup'])} counties with centroids in {DATA_PATH}")


if __name__ == "__main__":
    main()
