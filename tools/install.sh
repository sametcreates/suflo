#!/usr/bin/env bash
# Kesit — macOS / Linux gelistirici kurulumu
set -e

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.sametcreates.kesit"

echo "Kesit kuruluyor..."

# 1) Imzasiz eklentilere izin
for v in 9 10 11 12 13 14; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1 2>/dev/null || true
done
echo "  PlayerDebugMode acildi (CSXS 9-12)"

# 2) Dosyalari kopyala
rm -rf "$DEST"
mkdir -p "$DEST"
for item in CSXS css js jsx fonts emoji index.html .debug; do
  [ -e "$SRC/$item" ] && cp -R "$SRC/$item" "$DEST/"
done
echo "  Kopyalandi: $DEST"

echo ""
echo "Bitti. Premiere Pro'yu yeniden baslat, sonra:"
echo "  Window > Extensions > Kesit"
