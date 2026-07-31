#!/bin/bash
# Suflo — macOS kurulumu. Çift tıklanabilir.
cd "$(dirname "$0")"

KAYNAK="$(pwd)/panel"
HEDEF="$HOME/Library/Application Support/Adobe/CEP/extensions/com.sametcreates.kesit"

echo ""
echo "  ===================================="
echo "    SUFLO - Premiere Türkçe Altyazı"
echo "  ===================================="
echo ""

if [ ! -f "$KAYNAK/index.html" ]; then
  echo "  HATA: Panel dosyaları bulunamadı."
  echo ""
  echo "  Bu dosyayı indirdiğin ZIP'ten ÇIKARMADAN çalıştırmış olabilirsin."
  echo "  ZIP'e çift tıklayıp aç, sonra bu dosyayı çalıştır."
  echo ""
  read -p "  Kapatmak için Enter'a bas..."
  exit 1
fi

# Premiere açıkken kurulum yapılırsa panel bozuk yüklenir
if pgrep -x "Adobe Premiere Pro" >/dev/null 2>&1; then
  echo "  UYARI: Premiere Pro şu anda açık."
  echo "  Kurulumun düzgün olması için önce Premiere'i kapat."
  echo ""
  read -p "  Yine de devam edilsin mi? (E/H): " DEVAM
  case "$DEVAM" in
    [Ee]*) ;;
    *) echo "  Kurulum iptal edildi."; read -p "  Enter..."; exit 0 ;;
  esac
fi

# 1) İmzasız eklentilere izin. Suflo imzalı ama kendi sertifikasıyla;
#    Adobe yalnızca kendi onayladığı sertifikaları "güvenli" sayıyor.
echo "  [1/4] Premiere ayarı yapılıyor..."
for V in 9 10 11 12 13 14; do
  defaults write "com.adobe.CSXS.$V" PlayerDebugMode 1 2>/dev/null
done

# 2) Kopyala
echo "  [2/4] Panel kopyalanıyor..."
rm -rf "$HEDEF" 2>/dev/null
mkdir -p "$HEDEF"
if ! cp -R "$KAYNAK/." "$HEDEF/"; then
  echo ""
  echo "  HATA: Dosyalar kopyalanamadı."
  read -p "  Enter..."
  exit 1
fi

# 3) Karantina damgasını temizle.
#    İnternetten inen her dosyaya com.apple.quarantine konur; temizlenmezse
#    Premiere paneli "doğrulanamadı" diye açmayabilir.
echo "  [3/4] macOS güvenlik damgası temizleniyor..."
xattr -dr com.apple.quarantine "$HEDEF" 2>/dev/null

# 4) Doğrula
echo "  [4/4] Doğrulanıyor..."
if [ ! -f "$HEDEF/index.html" ] || [ ! -f "$HEDEF/CSXS/manifest.xml" ]; then
  echo "  HATA: Kurulum doğrulanamadı."
  read -p "  Enter..."
  exit 1
fi

echo ""
echo "  ===================================="
echo "    KURULUM TAMAM"
echo "  ===================================="
echo ""
echo "  Şimdi:"
echo "    1. Premiere Pro'yu aç (açıkken kurduysan kapatıp yeniden aç)"
echo "    2. Üstteki menüden:  Window > Extensions > Suflo"
echo ""
echo "  İlk altyazıda panel gerekli motoru kendisi indirir."
echo "  Mac'te yerel motor için Homebrew gerekir; panel sana söyler."
echo ""
echo "  Takılırsan: https://suflo.app"
echo ""
read -p "  Kapatmak için Enter'a bas..."
