#!/usr/bin/env bash
# Suflo — macOS kaldirma (uzanti kimligi tarihsel olarak com.sametcreates.kesit)
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.sametcreates.kesit"
if [ -d "$DEST" ]; then
  rm -rf "$DEST"
  echo "Suflo kaldirildi: $DEST"
else
  echo "Suflo zaten kurulu degil."
fi

# PlayerDebugMode: yalniz Suflo'nun degistirdigi geri alinir. Kurucu, deger zaten 1 degilse onceki
# degeri (yoksa "yok") SufloOncekiPlayerDebugMode isaretine yazar. Isaret yoksa dokunulmaz
# (Suflo'dan once de acikti ya da isaretsiz eski bir kurulum: diger eklentiler kullaniyor olabilir).
ISARET=SufloOncekiPlayerDebugMode
GERI=0
for v in 9 10 11 12 13 14; do
  ONCEKI="$(defaults read "com.adobe.CSXS.$v" "$ISARET" 2>/dev/null)" || continue
  if [ "$ONCEKI" = "yok" ]; then
    defaults delete "com.adobe.CSXS.$v" PlayerDebugMode 2>/dev/null || true
  else
    defaults write "com.adobe.CSXS.$v" PlayerDebugMode "$ONCEKI" 2>/dev/null || true
  fi
  defaults delete "com.adobe.CSXS.$v" "$ISARET" 2>/dev/null || true
  GERI=$((GERI + 1))
done
if [ "$GERI" -gt 0 ]; then
  echo "PlayerDebugMode Suflo'dan onceki haline dondu (CSXS surumu: $GERI)."
else
  echo "Not: PlayerDebugMode ayari dokunulmadan birakildi (Suflo'dan once de acikti ya da diger eklentiler kullaniyor olabilir)."
  echo "Kapatmak istersen: defaults delete com.adobe.CSXS.11 PlayerDebugMode"
fi
