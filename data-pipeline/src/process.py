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

    # csv_file = "../raw_source/beach.csv"

    output_dir = "../../static/data"
    output_file = os.path.join(output_dir, "spots.js")

    print("Membaca CSV...")

    df = pd.read_csv(csv_file)

    # Konversi koordinat
    df["lat"] = df["APPROX. GDA94 LAT"].apply(dms_to_dd)
    df["lng"] = df["APPROX. GDA94 LONG"].apply(dms_to_dd)

    # Buang data yang tidak punya koordinat
    df = df.dropna(subset=["lat", "lng"])

    os.makedirs(output_dir, exist_ok=True)

    with open(output_file, "w", encoding="utf-8") as f:

        f.write("window.SPOTS = [\n")

        for _, row in df.iterrows():

            name = str(row["PLACENAME"]).strip().replace("'", "\\'")

            f.write(
                f"    {{ name: '{name}', lat: {row['lat']:.4f}, lng: {row['lng']:.4f} }},\n"
            )

        f.write("];\n")

    print(f"✓ Berhasil membuat {output_file}")
    print(f"✓ Total lokasi: {len(df)}")


if __name__ == "__main__":
    main()