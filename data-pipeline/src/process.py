import os
import re
import pandas as pd


def dms_to_dd(dms):
    if pd.isna(dms):
        return None

    text = str(dms).strip()

    # Hilangkan spasi berlebih
    text = re.sub(r"\s+", " ", text)

    parts = text.split()

    # Kasus normal: -33 35 24
    if len(parts) == 3:
        deg = float(parts[0])
        minute = float(parts[1])
        second = float(parts[2])

    # Kasus rusak: -3530 54
    elif len(parts) == 2:
        first = parts[0]
        second = parts[1]

        sign = -1 if first.startswith("-") else 1
        first = first.replace("-", "")

        if len(first) == 4:
            deg = float(first[:2]) * sign
            minute = float(first[2:])
        elif len(first) == 3:
            deg = float(first[:1]) * sign
            minute = float(first[1:])
        elif len(first) == 5:
            deg = float(first[:3]) * sign
            minute = float(first[3:])
        else:
            return None

    else:
        return None

    return (1 if deg >= 0 else -1) * (
        abs(deg) + minute / 60 + second / 3600
    )


def title_case(text):
    """Title case dengan handle edge case state abbreviation."""
    if pd.isna(text):
        return ""
    keep_upper = {"NSW", "ACT", "QLD", "VIC", "SA", "WA", "NT", "TAS"}
    words = str(text).strip().split()
    result = []
    for word in words:
        if word.upper() in keep_upper:
            result.append(word.upper())
        else:
            result.append(word.capitalize())
    return " ".join(result)


def main():
    # ── Config paths ──────────────────────────────────────────────────────────
    csv_files = [
        "../raw_source/bay.csv",
        "../raw_source/beach.csv",
    ]
    except_file_path = "../../static/data/except_spots.csv"
    output_dir       = "../../static/data"
    output_file      = os.path.join(output_dir, "spots.js")

    # ── Step 1: Baca dan gabung semua CSV ─────────────────────────────────────
    dfs = []
    for csv_file in csv_files:
        if not os.path.exists(csv_file):
            print(f"⚠️  File tidak ditemukan, dilewati: {csv_file}")
            continue
        print(f"[*] Membaca {csv_file}...")
        df = pd.read_csv(csv_file)
        dfs.append(df)

    if not dfs:
        print("❌ Tidak ada CSV yang berhasil dibaca.")
        return

    combined = pd.concat(dfs, ignore_index=True)
    print(f"[*] Total baris gabungan: {len(combined)}")

    # ── Step 2: Konversi koordinat ────────────────────────────────────────────
    combined["lat"] = combined["APPROX. GDA94 LAT"].apply(dms_to_dd)
    combined["lng"] = combined["APPROX. GDA94 LONG"].apply(dms_to_dd)
    combined = combined.dropna(subset=["lat", "lng"])
    print(f"[*] Baris dengan koordinat valid: {len(combined)}")

    # ── Step 3: Tulis spots.js ────────────────────────────────────────────────
    os.makedirs(output_dir, exist_ok=True)

    with open(output_file, "w", encoding="utf-8") as f:
        f.write("window.SPOTS = [\n")
        for _, row in combined.iterrows():
            name = title_case(row["PLACENAME"])
            lga  = title_case(row["LGA"])

            # Format: "Maroubra Bay, Randwick."
            display_name = f"{name}, {lga}." if lga else f"{name}."
            display_name = display_name.replace("'", "\\'")

            f.write(
                f"    {{ name: '{display_name}', lat: {row['lat']:.4f}, lng: {row['lng']:.4f} }},\n"
            )
        f.write("];\n")

    print(f"✓ spots.js berhasil dibuat: {output_file}")

    # ── Step 4: Filter exclude list ───────────────────────────────────────────
    if not os.path.exists(except_file_path):
        print(f"⚠️  Tidak ada file pengecualian di {except_file_path}, filter dilewati.")
        return

    except_locations = set()
    with open(except_file_path, "r", encoding="utf-8") as f:
        for line in f:
            name = line.strip()
            if name:
                except_locations.add(name)
    print(f"[*] Memuat {len(except_locations)} lokasi pengecualian.")

    # Regex untuk ekstrak nama dari baris spots.js
    name_regex = re.compile(r"name:\s*'((?:\\'|[^'])*)'")
    updated_lines = []
    deleted_count = 0

    with open(output_file, "r", encoding="utf-8") as f:
        lines = f.readlines()

    for line in lines:
        match = name_regex.search(line)
        if match:
            spot_name = match.group(1).strip().replace("\\'", "'")
            # Partial match — hapus kalau nama spot MENGANDUNG salah satu entry except
            should_exclude = any(
                exc.lower() in spot_name.lower()
                for exc in except_locations
            )
            if should_exclude:
                deleted_count += 1
            else:
                updated_lines.append(line)
        else:
            updated_lines.append(line)

    with open(output_file, "w", encoding="utf-8") as f:
        f.writelines(updated_lines)

    # ── Report ────────────────────────────────────────────────────────────────
    print(f"\n==== REPORT ====")
    print(f"✓ Total lokasi ditulis  : {len(combined)}")
    print(f"✓ Total lokasi dihapus  : {deleted_count}")
    print(f"✓ Total lokasi final    : {len(combined) - deleted_count}")
    print(f"✓ Output                : {output_file}")
    print(f"================")


if __name__ == "__main__":
    main()