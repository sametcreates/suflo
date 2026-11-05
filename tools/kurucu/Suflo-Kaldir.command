#!/bin/bash
# Suflo — macOS kaldırma. Çift tıklanabilir; Suflo-Kur.command'ın tersi.
# İki dilli: her Türkçe satırın altında İngilizcesi. Onay E/e (Evet) ya da Y/y (Yes).
# Panel klasörünü siler ve PlayerDebugMode'u yalnız Suflo değiştirdiyse eski hâline döndürür
# (tools/uninstall.sh ile aynı kural).
HEDEF="$HOME/Library/Application Support/Adobe/CEP/extensions/com.sametcreates.kesit"

echo ""
echo "  ===================================="
echo "    SUFLO - Kaldırma / Uninstall"
echo "  ===================================="
echo ""

# 1) Onay: yanlışlıkla çift tıklama hiçbir şeyi silmesin
read -p "  Suflo kaldırılsın mı? / Uninstall Suflo? (E/Y = evet/yes, H/N = hayır/no): " DEVAM
case "$DEVAM" in
  [EeYy]*) ;;
  *) echo "  Kaldırma iptal edildi. / Uninstall cancelled."; read -p "  Enter..."; exit 0 ;;
esac

# 2) PlayerDebugMode: kurucu, değer zaten 1 değilse önceki değeri (yoksa "yok") SufloOncekiPlayerDebugMode
#    işaretine yazar. İşaret yoksa dokunulmaz (Suflo'dan önce de açıktı ya da işaretsiz eski bir kurulum:
#    diğer eklentiler kullanıyor olabilir).
echo "  [1/2] Premiere ayarı geri alınıyor... / Restoring the Premiere setting..."
ISARET=SufloOncekiPlayerDebugMode
GERI=0
for V in 9 10 11 12 13 14; do
  ONCEKI="$(defaults read "com.adobe.CSXS.$V" "$ISARET" 2>/dev/null)" || continue
  if [ "$ONCEKI" = "yok" ]; then
    defaults delete "com.adobe.CSXS.$V" PlayerDebugMode 2>/dev/null || true
  else
    defaults write "com.adobe.CSXS.$V" PlayerDebugMode "$ONCEKI" 2>/dev/null || true
  fi
  defaults delete "com.adobe.CSXS.$V" "$ISARET" 2>/dev/null || true
  GERI=$((GERI + 1))
done

# 3) Panel klasörünü sil
echo "  [2/2] Panel siliniyor... / Removing the panel..."
if [ -d "$HEDEF" ]; then
  if ! rm -rf "$HEDEF"; then
    echo ""
    echo "  HATA: Panel klasörü silinemedi. Premiere Pro ve After Effects'i kapatıp tekrar dene."
    echo "  ERROR: The panel folder couldn't be removed. Close Premiere Pro and After Effects, then try again."
    read -p "  Enter..."
    exit 1
  fi
  echo "  Suflo kaldırıldı. / Suflo was uninstalled."
else
  echo "  Suflo zaten kurulu değil. / Suflo isn't installed."
fi

echo ""
if [ "$GERI" -gt 0 ]; then
  echo "  PlayerDebugMode Suflo'dan önceki hâline döndü (CSXS: $GERI)."
  echo "  PlayerDebugMode is back to its pre-Suflo value (CSXS: $GERI)."
else
  echo "  PlayerDebugMode ayarına dokunulmadı (Suflo'dan önce de açıktı ya da diğer eklentiler kullanıyor olabilir)."
  echo "  PlayerDebugMode was left as is (it was on before Suflo, or other extensions may use it)."
fi
echo ""
read -p "  Kapatmak için Enter'a bas / Press Enter to close..."
exit 0
