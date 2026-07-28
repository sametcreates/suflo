/*
 * Kesit için minimal CSInterface sarmalayıcısı.
 * Adobe CEP ortamında window.__adobe_cep__ üzerinden çalışır;
 * normal tarayıcıda (geliştirme önizlemesi) zararsız stub'a düşer.
 */
(function () {
  "use strict";

  var hasCEP = typeof window.__adobe_cep__ !== "undefined";

  function CSInterface() {}

  CSInterface.prototype.inCEP = function () { return hasCEP; };

  CSInterface.prototype.evalScript = function (script, callback) {
    if (!hasCEP) {
      if (callback) callback(JSON.stringify({ ok: false, error: "CEP dışı önizleme modu" }));
      return;
    }
    window.__adobe_cep__.evalScript(script, callback || function () {});
  };

  CSInterface.prototype.getSystemPath = function (pathType) {
    if (!hasCEP) return "";
    var path = decodeURI(window.__adobe_cep__.getSystemPath(pathType));
    return path.replace("file:///", "").replace("file://", "");
  };

  CSInterface.prototype.openURLInDefaultBrowser = function (url) {
    if (hasCEP && window.cep && window.cep.util) {
      window.cep.util.openURLInDefaultBrowser(url);
    } else {
      window.open(url, "_blank");
    }
  };

  CSInterface.SystemPath = {
    USER_DATA: "userData",
    EXTENSION: "extension",
    MY_DOCUMENTS: "myDocuments"
  };

  window.CSInterface = CSInterface;
})();
