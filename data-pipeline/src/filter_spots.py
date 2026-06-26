import os
import re

def main():
    except_file_path = "../../static/data/except_spots.csv"
    spots_file_path = "../../static/data/spots.js"

    if not os.path.exists(except_file_path):
        print(f"❌ Error: File {except_file_path} tidak ditemukan.")
        return
    if not os.path.exists(spots_file_path):
        print(f"❌ Error: File {spots_file_path} tidak ditemukan.")
        return

    # Muat list pengecualian
    except_locations = set()
    with open(except_file_path, "r", encoding="utf-8") as f:
        for line in f:
            name = line.strip()
            if name:
                except_locations.add(name)

    print(f"[*] Memuat {len(except_locations)} lokasi pengecualian.")

    # FIX: Regex diperbarui untuk mengecek karakter biasa ATAU karakter petik yang di-escape (\')
    name_regex = re.compile(r"name:\s*'((?:\\'|[^'])*)'")
    
    updated_lines = []
    deleted_count = 0

    with open(spots_file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    for line in lines:
        match = name_regex.search(line)
        if match:
            spot_name = match.group(1).strip()
            
            # Mengembalikan \' menjadi ' untuk dicocokkan dengan CSV
            normalized_name = spot_name.replace("\\'", "'")

            if normalized_name in except_locations:
                deleted_count += 1
            else:
                updated_lines.append(line)
        else:
            updated_lines.append(line)

    # Tulis kembali data
    with open(spots_file_path, "w", encoding="utf-8") as f:
        f.writelines(updated_lines)

    print(f"\n==== REPORT FILTRASI ====")
    print(f"✓ Total lokasi dihapus : {deleted_count}")
    print(f"✓ File ter-update       : {spots_file_path}")
    print(f"=========================")

if __name__ == "__main__":
    main()