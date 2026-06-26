import os
import pandas as pd


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

        # hilangkan tanda minus
        first = first.replace("-", "")

        if len(first) == 4:
            # 3530 -> 35 30
            deg = float(first[:2]) * sign
            minute = float(first[2:])

        elif len(first) == 3:
            # 930 -> 9 30
            deg = float(first[:1]) * sign
            minute = float(first[1:])

        elif len(first) == 5:
            # 15118 -> 151 18 (longitude)
            deg = float(first[:3]) * sign
            minute = float(first[3:])
        else:
            return None

    else:
        return None

    return (1 if deg >= 0 else -1) * (
        abs(deg) + minute / 60 + second / 3600
    )


def main():

    # csv_files = ["../raw_source/beach.csv", "../raw_source/bay.csv"]

    output_dir = "../../static/data"
    output_file = os.path.join(output_dir, "spots.js")

    all_dfs = []

    # Membaca semua file CSV yang ada di dalam list
    for file in csv_files:
        if os.path.exists(file):
            print(f"Membaca {file}...")
            df = pd.read_csv(file)
            all_dfs.append(df)
        else:
            print(f"⚠️  File tidak ditemukan: {file}")

    if not all_dfs:
        print("❌ Error: Tidak ada data yang bisa diproses.")
        return

    # Gabungkan menjadi satu DataFrame besar
    combined_df = pd.concat(all_dfs, ignore_index=True)

    # Konversi koordinat
    combined_df["lat"] = combined_df["APPROX. GDA94 LAT"].apply(dms_to_dd)
    combined_df["lng"] = combined_df["APPROX. GDA94 LONG"].apply(dms_to_dd)

    # Buang data kosong atau gagal konversi
    combined_df = combined_df.dropna(subset=["lat", "lng"])

    # Tulis ke file output spots.js
    os.makedirs(output_dir, exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        f.write("window.SPOTS = [\n")

        for _, row in combined_df.iterrows():
            name = str(row["PLACENAME"]).strip().replace("'", "\\'")
            f.write(
                f"    {{ name: '{name}', lat: {row['lat']:.6f}, lng: {row['lng']:.6f} }},\n"
            )

        f.write("];\n")

    print(f"✓ Berhasil membuat {output_file}")
    print(f"✓ Total keseluruhan lokasi: {len(combined_df)}")


if __name__ == "__main__":
    main()