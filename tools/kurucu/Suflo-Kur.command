#!/bin/bash
# Suflo — macOS kurulumu. Çift tıklanabilir.
# İki dilli: her Türkçe satırın altında İngilizcesi. Onay E/e (Evet) ya da Y/y (Yes).
cd "$(dirname "$0")"

KAYNAK="$(pwd)/panel"
HEDEF="$HOME/Library/Application Support/Adobe/CEP/extensions/com.sametcreates.kesit"

echo ""
echo "  ===================================="
echo "    SUFLO - Premiere Altyazı / Captions"
echo "  ===================================="
echo ""

if [ ! -f "$KAYNAK/index.html" ]; then
  echo "  HATA: Panel dosyaları bulunamadı."
  echo "  ERROR: Panel files not found."
  echo ""
  echo "  Bu dosyayı indirdiğin ZIP'ten ÇIKARMADAN çalıştırmış olabilirsin."
  echo "  ZIP'e çift tıklayıp aç, sonra bu dosyayı çalıştır."
  echo "  You may have run this file without EXTRACTING the ZIP first."
  echo "  Double-click the ZIP to extract it, then run this file."
  echo ""
  read -p "  Kapatmak için Enter'a bas / Press Enter to close..."
  exit 1
fi

# Premiere açıkken kurulum yapılırsa panel bozuk yüklenir
if pgrep -x "Adobe Premiere Pro" >/dev/null 2>&1; then
  echo "  UYARI: Premiere Pro şu anda açık."
  echo "  Kurulumun düzgün olması için önce Premiere'i kapat."
  echo "  WARNING: Premiere Pro is running. Close it first for a clean install."
  echo ""
  read -p "  Yine de devam edilsin mi? / Continue anyway? (E/Y = evet/yes, H/N = hayır/no): " DEVAM
  case "$DEVAM" in
    [EeYy]*) ;;
    *) echo "  Kurulum iptal edildi. / Setup cancelled."; read -p "  Enter..."; exit 0 ;;
  esac
fi

# 1) İmzasız eklentilere izin. Suflo imzalı ama kendi sertifikasıyla;
#    Adobe yalnızca kendi onayladığı sertifikaları "güvenli" sayıyor.
echo "  [1/4] Premiere ayarı yapılıyor... / Configuring Premiere..."
for V in 9 10 11 12 13 14; do
  defaults write "com.adobe.CSXS.$V" PlayerDebugMode 1 2>/dev/null
done

# 2) Kopyala
echo "  [2/4] Panel kopyalanıyor... / Copying the panel..."
rm -rf "$HEDEF" 2>/dev/null
mkdir -p "$HEDEF"
if ! cp -R "$KAYNAK/." "$HEDEF/"; then
  echo ""
  echo "  HATA: Dosyalar kopyalanamadı. / ERROR: Files couldn't be copied."
  read -p "  Enter..."
  exit 1
fi

# 3) Karantina damgasını temizle.
#    İnternetten inen her dosyaya com.apple.quarantine konur; temizlenmezse
#    Premiere paneli "doğrulanamadı" diye açmayabilir.
echo "  [3/4] macOS güvenlik damgası temizleniyor... / Clearing the macOS quarantine flag..."
xattr -dr com.apple.quarantine "$HEDEF" 2>/dev/null

# 4) Doğrula
echo "  [4/4] Doğrulanıyor... / Verifying..."
if [ ! -f "$HEDEF/index.html" ] || [ ! -f "$HEDEF/CSXS/manifest.xml" ]; then
  echo "  HATA: Kurulum doğrulanamadı. / ERROR: Install couldn't be verified."
  read -p "  Enter..."
  exit 1
fi

echo ""
echo "  ===================================="
echo "    KURULUM TAMAM / SETUP COMPLETE"
echo "  ===================================="
echo ""
echo "  Şimdi:"
echo "    1. Premiere Pro'yu aç (açıkken kurduysan kapatıp yeniden aç)"
echo "    2. Üstteki menüden:"
echo "         Premiere 25.6+ / 2026 : Window > Extensions (Legacy) > Suflo"
echo "         Daha eski sürümler    : Window > Extensions > Suflo"
echo ""
echo "  Next:"
echo "    1. Open Premiere Pro (restart it if it was open during setup)"
echo "    2. From the top menu:"
echo "         Premiere 25.6+ / 2026 : Window > Extensions (Legacy) > Suflo"
echo "         Older versions        : Window > Extensions > Suflo"
echo ""
echo "  İlk açılışta \"İlk altyazın 2 dakikada\" rehberi seni adım adım götürür;"
echo "  gerekli motoru panel kendisi indirir. Mac'te yerel motor için Homebrew"
echo "  gerekir; yoksa rehber ücretsiz Groq anahtarıyla buluttan başlatır."
echo "  On first launch, pick Türkçe or English (beta); the setup guide walks you"
echo "  through it. The local engine on a Mac needs Homebrew; without it the guide"
echo "  starts in the cloud with a free Groq key."
echo ""
echo "  Menüde Suflo yoksa / Suflo missing from the menu:"
echo "    https://suflo.app/blog/premiere-suflo-paneli-gorunmuyor"
echo "  Takılırsan / Need help: https://suflo.app"
echo ""
read -p "  Kapatmak için Enter'a bas / Press Enter to close..."
