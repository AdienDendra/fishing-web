import csv
import json
import re
from pathlib import Path

import pandas as pd

# ── Project paths ─────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
PIPELINE_DIR = SCRIPT_DIR.parent
PROJECT_DIR = PIPELINE_DIR.parent

RAW_SOURCE_DIR = PIPELINE_DIR / "raw_source"
OUTPUT_DIR = PROJECT_DIR / "static" / "data"

OFFICIAL_CSV_FILES = [
    RAW_SOURCE_DIR / "bay.csv",
    RAW_SOURCE_DIR / "beach.csv",
]

CUSTOM_LOCATION_FILE = RAW_SOURCE_DIR / "customLocation.csv"
EXCEPT_FILE = OUTPUT_DIR / "except_spots.csv"
OUTPUT_FILE = OUTPUT_DIR / "spots.js"


def dms_to_dd(dms):
    """
    Convert DMS coordinates into decimal degrees.

    Supported examples:
    - "-33 35 24"
    - "151 17 04"
    - "-3530 54"
    """
    if pd.isna(dms):
        return None

    text = re.sub(r"\s+", " ", str(dms).strip())
    parts = text.split()

    try:
        # Normal format: -33 35 24
        if len(parts) == 3:
            degrees = float(parts[0])
            minutes = float(parts[1])
            seconds = float(parts[2])

        # Malformed source format: -3530 54
        elif len(parts) == 2:
            first = parts[0]
            seconds = float(parts[1])

            sign = -1 if first.startswith("-") else 1
            digits = first.lstrip("+-")

            if len(digits) == 3:
                degrees = float(digits[:1]) * sign
                minutes = float(digits[1:])
            elif len(digits) == 4:
                degrees = float(digits[:2]) * sign
                minutes = float(digits[2:])
            elif len(digits) == 5:
                degrees = float(digits[:3]) * sign
                minutes = float(digits[3:])
            else:
                return None

        else:
            return None

    except (TypeError, ValueError):
        return None

    direction = -1 if degrees < 0 else 1

    return direction * (
        abs(degrees)
        + minutes / 60
        + seconds / 3600
    )


def title_case(text):
    """
    Convert official dataset names to readable title case while preserving
    Australian state abbreviations.
    """
    if pd.isna(text):
        return ""

    keep_upper = {
        "NSW",
        "ACT",
        "QLD",
        "VIC",
        "SA",
        "WA",
        "NT",
        "TAS",
    }

    words = str(text).strip().split()
    result = []

    for word in words:
        if word.upper() in keep_upper:
            result.append(word.upper())
        else:
            result.append(word.capitalize())

    return " ".join(result)


def load_official_locations(csv_files):
    """
    Load NSW Geographical Names CSV files.

    Official source coordinates use DMS format and therefore need conversion
    into decimal latitude/longitude values.
    """
    locations = []

    required_columns = {
        "PLACENAME",
        "LGA",
        "APPROX. GDA94 LAT",
        "APPROX. GDA94 LONG",
    }

    for csv_file in csv_files:
        if not csv_file.exists():
            print(f"⚠️  File tidak ditemukan, dilewati: {csv_file}")
            continue

        print(f"[*] Membaca official source: {csv_file.name}")

        try:
            source_df = pd.read_csv(csv_file)
        except Exception as exc:
            print(f"❌ Gagal membaca {csv_file.name}: {exc}")
            continue

        missing_columns = required_columns.difference(source_df.columns)

        if missing_columns:
            missing = ", ".join(sorted(missing_columns))
            print(
                f"⚠️  {csv_file.name} tidak memiliki kolom: {missing}. "
                "File dilewati."
            )
            continue

        normalized = pd.DataFrame(
            {
                "name": source_df["PLACENAME"].apply(title_case),
                "lga": source_df["LGA"].apply(title_case),
                "lat": source_df["APPROX. GDA94 LAT"].apply(dms_to_dd),
                "lng": source_df["APPROX. GDA94 LONG"].apply(dms_to_dd),
                "source": csv_file.stem,
            }
        )

        normalized = normalized.dropna(subset=["lat", "lng"])
        normalized = normalized[normalized["name"].str.strip() != ""]

        normalized["display_name"] = normalized.apply(
            lambda row: (
                f"{row['name']}, {row['lga']}"
                if row["lga"]
                else row["name"]
            ),
            axis=1,
        )

        locations.append(normalized)

        print(
            f"    ✓ {len(normalized)} lokasi valid dari {csv_file.name}"
        )

    if not locations:
        return pd.DataFrame(
            columns=[
                "name",
                "lga",
                "lat",
                "lng",
                "source",
                "display_name",
            ]
        )

    return pd.concat(locations, ignore_index=True)


def load_custom_locations(csv_file):
    """
    Load manually curated fishing locations.

    Supported formats without a header:

        location, suburb, latitude, longitude
        location, latitude, longitude

    Examples:

        Manly Beach, Manly, -33.8088, 151.3073
        Sydney Harbour, -33.8214, 151.2904
        Little Bay, , -33.9776, 151.2576

    The suburb field is optional. When it is empty or omitted, the display
    name contains only the location name.
    """
    output_columns = [
        "name",
        "lga",
        "lat",
        "lng",
        "source",
        "display_name",
    ]

    if not csv_file.exists():
        print(f"⚠️  Custom location file tidak ditemukan: {csv_file}")
        return pd.DataFrame(columns=output_columns)

    print(f"[*] Membaca custom locations: {csv_file.name}")

    records = []
    invalid_count = 0

    try:
        with csv_file.open("r", encoding="utf-8-sig", newline="") as file:
            reader = csv.reader(file, skipinitialspace=True)

            for line_number, row in enumerate(reader, start=1):
                # Skip empty rows.
                if not row or not any(str(value).strip() for value in row):
                    continue

                # Skip comment rows.
                if str(row[0]).strip().startswith("#"):
                    continue

                cleaned = [str(value).strip() for value in row]

                name = ""
                suburb = ""
                lat_text = ""
                lng_text = ""

                if len(cleaned) == 4:
                    # location, suburb, latitude, longitude
                    name, suburb, lat_text, lng_text = cleaned

                elif len(cleaned) == 3:
                    # Backward-compatible format:
                    # location, latitude, longitude
                    name, lat_text, lng_text = cleaned

                else:
                    print(
                        f"⚠️  Baris {line_number} dilewati: "
                        f"jumlah kolom harus 3 atau 4."
                    )
                    invalid_count += 1
                    continue

                # Optional header support.
                normalized_name = name.casefold()
                normalized_lat = lat_text.casefold()
                normalized_lng = lng_text.casefold()

                if (
                    normalized_name in {"location", "name", "placename"}
                    and normalized_lat in {"lat", "latitude"}
                    and normalized_lng in {"lng", "lon", "longitude"}
                ):
                    continue

                try:
                    lat = float(lat_text)
                    lng = float(lng_text)
                except (TypeError, ValueError):
                    print(
                        f"⚠️  Baris {line_number} dilewati: "
                        f"koordinat tidak valid."
                    )
                    invalid_count += 1
                    continue

                if not name:
                    print(
                        f"⚠️  Baris {line_number} dilewati: "
                        f"nama lokasi kosong."
                    )
                    invalid_count += 1
                    continue

                if not -90 <= lat <= 90 or not -180 <= lng <= 180:
                    print(
                        f"⚠️  Baris {line_number} dilewati: "
                        f"koordinat di luar range."
                    )
                    invalid_count += 1
                    continue

                display_name = (
                    f"{name}, {suburb}"
                    if suburb
                    else name
                )

                records.append(
                    {
                        "name": name,
                        # Reuse the normalized schema column. For custom
                        # locations this stores the optional suburb.
                        "lga": suburb,
                        "lat": lat,
                        "lng": lng,
                        "source": "custom",
                        "display_name": display_name,
                    }
                )

    except (OSError, csv.Error) as exc:
        print(f"❌ Gagal membaca {csv_file.name}: {exc}")
        return pd.DataFrame(columns=output_columns)

    custom_df = pd.DataFrame(records, columns=output_columns)

    print(f"    ✓ {len(custom_df)} custom location valid")

    if invalid_count:
        print(f"    ⚠️  {invalid_count} baris custom dilewati")

    return custom_df

def load_excluded_locations(file_path):
    """Load partial-name exclusions from except_spots.csv."""
    if not file_path.exists():
        print(
            f"⚠️  Tidak ada file pengecualian di {file_path}. "
            "Filter dilewati."
        )
        return set()

    excluded_locations = set()

    with file_path.open("r", encoding="utf-8") as file:
        for line in file:
            name = line.strip()

            if name:
                excluded_locations.add(name.casefold())

    print(
        f"[*] Memuat {len(excluded_locations)} lokasi pengecualian."
    )

    return excluded_locations


def is_excluded(display_name, excluded_locations):
    """
    Return True when a display name contains one of the exclusion entries.

    Comparison is case-insensitive and uses the existing partial-match
    behaviour.
    """
    normalized_name = str(display_name).casefold()

    return any(
        excluded_name in normalized_name
        for excluded_name in excluded_locations
    )


def remove_duplicate_locations(locations):
    """
    Remove exact duplicate map entries.

    A duplicate means the same case-insensitive display name and the same
    coordinates rounded to four decimal places.
    """
    if locations.empty:
        return locations

    deduplicated = locations.copy()

    deduplicated["_name_key"] = (
        deduplicated["display_name"]
        .astype(str)
        .str.strip()
        .str.casefold()
    )
    deduplicated["_lat_key"] = deduplicated["lat"].round(4)
    deduplicated["_lng_key"] = deduplicated["lng"].round(4)

    before_count = len(deduplicated)

    deduplicated = deduplicated.drop_duplicates(
        subset=["_name_key", "_lat_key", "_lng_key"],
        keep="last",
    )

    duplicate_count = before_count - len(deduplicated)

    if duplicate_count:
        print(f"[*] Menghapus {duplicate_count} lokasi duplikat.")

    return deduplicated.drop(
        columns=["_name_key", "_lat_key", "_lng_key"]
    )


def write_spots_js(locations, output_file):
    """Write normalized map locations into static/data/spots.js."""
    output_file.parent.mkdir(parents=True, exist_ok=True)

    with output_file.open("w", encoding="utf-8") as file:
        file.write("window.SPOTS = [\n")

        for row in locations.itertuples(index=False):
            # json.dumps safely escapes apostrophes, quotes, and Unicode.
            display_name = json.dumps(
                str(row.display_name),
                ensure_ascii=False,
            )

            file.write(
                "    { "
                f"name: {display_name}, "
                f"lat: {float(row.lat):.4f}, "
                f"lng: {float(row.lng):.4f}"
                " },\n"
            )

        file.write("];\n")


def main():
    # ── Step 1: Load official and custom datasets ──────────────────────────────
    official_locations = load_official_locations(OFFICIAL_CSV_FILES)
    custom_locations = load_custom_locations(CUSTOM_LOCATION_FILE)

    all_locations = pd.concat(
        [official_locations, custom_locations],
        ignore_index=True,
    )

    if all_locations.empty:
        print("❌ Tidak ada lokasi yang berhasil diproses.")
        return

    total_before_filter = len(all_locations)

    print(
        f"[*] Total sebelum filter: {total_before_filter} "
        f"({len(official_locations)} official + "
        f"{len(custom_locations)} custom)"
    )

    # ── Step 2: Remove exact duplicates ────────────────────────────────────────
    all_locations = remove_duplicate_locations(all_locations)

    # ── Step 3: Apply exclusion list ───────────────────────────────────────────
    excluded_locations = load_excluded_locations(EXCEPT_FILE)

    if excluded_locations:
        exclusion_mask = all_locations["display_name"].apply(
            lambda name: is_excluded(name, excluded_locations)
        )

        deleted_count = int(exclusion_mask.sum())
        final_locations = all_locations[~exclusion_mask].copy()
    else:
        deleted_count = 0
        final_locations = all_locations.copy()

    # Keep stable alphabetical output for predictable Git diffs.
    final_locations = final_locations.sort_values(
        by="display_name",
        key=lambda series: series.str.casefold(),
    ).reset_index(drop=True)

    # ── Step 4: Write output ───────────────────────────────────────────────────
    write_spots_js(final_locations, OUTPUT_FILE)

    # ── Report ────────────────────────────────────────────────────────────────
    print("\n==== REPORT ====")
    print(f"✓ Official locations : {len(official_locations)}")
    print(f"✓ Custom locations   : {len(custom_locations)}")
    print(f"✓ Excluded locations : {deleted_count}")
    print(f"✓ Final locations    : {len(final_locations)}")
    print(f"✓ Output             : {OUTPUT_FILE}")
    print("================")


if __name__ == "__main__":
    main()