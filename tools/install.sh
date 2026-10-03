#!/usr/bin/env bash
# Suflo — macOS gelistirici kurulumu (Premiere Linux'ta yok; yol macOS CEP klasoru)
set -e

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.sametcreates.kesit"

echo "Suflo kuruluyor..."

# 1) Imzasiz eklentilere izin
for v in 9 10 11 12 13 14; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1 2>/dev/null || true
done
echo "  PlayerDebugMode acildi (CSXS 9-12)"

# 2) Dosyalari kopyala
rm -rf "$DEST"
mkdir -p "$DEST"
for item in CSXS css js jsx fonts emoji assets index.html .debug; do
  [ -e "$SRC/$item" ] && cp -R "$SRC/$item" "$DEST/"
done
echo "  Kopyalandi: $DEST"

echo ""
echo "Bitti. Premiere Pro'yu yeniden baslat, sonra:"
echo "  Premiere 25.6+ / 2026:  Window > Extensions (Legacy) > Suflo"
echo "  Daha eski surumler:     Window > Extensions > Suflo"
echo "  Menude yoksa: https://suflo.app/blog/premiere-suflo-paneli-gorunmuyor"
