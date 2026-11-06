/* GRATTA E VINCI PRO — pagina ponte condivisa da tutte le attività.
   Ogni attività ha la sua cartella /<slug>/ con un index.html che imposta window.SLUG e carica questo file.
   - legge clienti.json (indirizzo della web app Google dell'attività, scadenza della prova)
   - mostra il gioco dentro un riquadro (così l'iPhone non apre l'app Google Drive)
   - scanner del QR premio per il back office
   - ricorda la cartolina del link unico su questo telefono */
(function () {
  "use strict";
  var SLUG = window.SLUG;
  var BASE = location.origin + "/grattaevinci/" + SLUG + "/";
  var GOOGLE_ORIGINS = /^https:\/\/([a-z0-9-]+\.)*(google\.com|googleusercontent\.com)$/;
  var params = new URLSearchParams(location.search);
  var staff = params.get("p") === "staff";
  var torna = !!(params.get("invito") || params.get("torna"));
  var $ = function (id) { return document.getElementById(id); };

  if (torna) {
    document.documentElement.style.background = document.body.style.background = "#F6EEDF";
    $("loading").style.color = "#8E1F12";
  }

  function blocco(titolo, testo) {
    $("loading").remove();
    var b = $("blocco");
    b.hidden = false;
    $("bloccoTitolo").textContent = titolo;
    $("bloccoTesto").textContent = testo;
    if (torna) b.classList.add("chiaro");
  }

  fetch("../clienti.json?v=" + Date.now(), { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
    .then(function (db) {
      var c = db.attivita && db.attivita[SLUG];
      var fornitore = (db.fornitore && db.fornitore.contatto) ? " (" + db.fornitore.contatto + ")" : "";
      if (!c || !c.app) return blocco("Pagina non trovata", "Questo link non corrisponde a nessuna attività.");
      if (c.nome) document.title = (staff ? "Back office · " : "") + c.nome;
      var oggi = new Date().toISOString().slice(0, 10);
      var scaduta = c.stato === "sospeso" || (c.fino && oggi > c.fino);
      if (scaduta) {
        var prova = c.stato === "prova";
        if (staff) return blocco(prova ? "Periodo di prova terminato" : "Servizio non attivo",
          (c.fino ? (prova ? "La prova gratuita è terminata il " : "Il servizio è scaduto il ") + c.fino.split("-").reverse().join("/") + ". " : "") +
          "Per continuare a usare il gioco contatta il fornitore del servizio" + fornitore + ". I tuoi dati restano nel tuo Foglio Google.");
        return blocco("Gioco non disponibile", "Il gratta e vinci di " + (c.nome || "questa attività") + " non è disponibile in questo momento. Torna a trovarci!");
      }
      avvia(c.app);
    })
    .catch(function () { blocco("Connessione non riuscita", "Controlla la connessione a internet e riprova."); });

  var f, dest;
  function avvia(app) {
    dest = new URL(app);
    params.forEach(function (v, k) { if (["bonus", "p", "codice", "invito", "torna"].indexOf(k) >= 0) dest.searchParams.set(k, v); });
    if (staff) dest.searchParams.set("ponte", BASE);   // il back office usa questo indirizzo per i QR
    if (params.get("torna") && !params.get("invito")) {
      try {
        var salvata = JSON.parse(localStorage.getItem("gv-carta-" + SLUG) || "null");
        if (salvata && salvata.carta && salvata.fino > Date.now()) dest.searchParams.set("carta", salvata.carta);
      } catch (e) {}
    }
    f = document.createElement("iframe");
    f.src = dest.toString();
    f.title = staff ? "Back office" : "Gratta e vinci";
    f.allow = "clipboard-write; screen-wake-lock";
    f.addEventListener("load", function () { var l = $("loading"); if (l) l.remove(); });
    document.body.appendChild(f);
  }

  /* ---------- Scanner del QR premio (back office) ---------- */
  var scan = $("scan"), video = $("video"), msg = $("scanMsg");
  var stream = null, timer = null, detector = null, canvas = document.createElement("canvas"), ctx2d = canvas.getContext("2d", { willReadFrequently: true });
  var CODICE = /[A-Z0-9]{2,}-[A-Z0-9]{4}-[A-Z0-9]{4}/;
  function chiudi() {
    clearTimeout(timer); timer = null;
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null; video.srcObject = null; scan.hidden = true;
  }
  function errore(t) { msg.textContent = t; msg.className = "msg err"; }
  function apri() {
    msg.textContent = "Tieni il QR del cliente dentro il riquadro."; msg.className = "msg";
    scan.hidden = false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { errore("Questo telefono non permette di usare la fotocamera qui. Scrivi il codice a mano."); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then(function (s) { stream = s; video.srcObject = s; return video.play(); })
      .then(function () {
        if ("BarcodeDetector" in window) { try { detector = new BarcodeDetector({ formats: ["qr_code"] }); } catch (e) { detector = null; } }
        leggi();
      })
      .catch(function () { errore("Fotocamera non disponibile. Consenti l'accesso alla fotocamera per questo sito nelle impostazioni del browser, oppure scrivi il codice a mano."); });
  }
  function trovato(testo) {
    var m = String(testo || "").toUpperCase().match(CODICE);
    if (!m) { errore("Questo QR non è un codice premio. Inquadra il QR mostrato dal cliente dopo la vincita."); return false; }
    if (navigator.vibrate) navigator.vibrate(80);
    chiudi(); consegna(m[0]);
    return true;
  }
  function leggi() {
    if (!stream) return;
    var poi = function () { timer = setTimeout(leggi, 180); };
    if (video.readyState < 2) return poi();
    if (detector) {
      detector.detect(video).then(function (r) { if (!(r.length && trovato(r[0].rawValue))) poi(); }).catch(function () { detector = null; poi(); });
      return;
    }
    var w = video.videoWidth, h = video.videoHeight;
    if (!w || !h || typeof jsQR !== "function") return poi();
    var s = Math.min(1, 640 / Math.max(w, h));
    canvas.width = Math.round(w * s); canvas.height = Math.round(h * s);
    ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);
    var img = ctx2d.getImageData(0, 0, canvas.width, canvas.height);
    var r = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
    if (!(r && trovato(r.data))) poi();
  }
  var confermato = false;
  function inviaATutti(win, dato, livello) {
    try { win.postMessage(dato, "*"); } catch (e) {}
    if (livello > 4) return;
    try { for (var i = 0; i < win.frames.length; i++) inviaATutti(win.frames[i], dato, livello + 1); } catch (e) {}
  }
  function consegna(codice) {
    confermato = false;
    inviaATutti(f.contentWindow, { type: "gp-codice", codice: codice }, 0);
    setTimeout(function () {
      if (confermato) return;
      var u = new URL(dest.toString()); u.searchParams.set("codice", codice); f.src = u.toString();
    }, 1500);
  }
  window.addEventListener("message", function (e) {
    if (!GOOGLE_ORIGINS.test(e.origin) || !e.data) return;
    if (e.data.type === "gp-scan" && staff) apri();
    if (e.data.type === "gp-ok") confermato = true;
    if (e.data.type === "gp-torna-carta" && typeof e.data.carta === "string" && /^[A-Z0-9-]{6,20}$/.test(e.data.carta)) {
      var g = Math.min(365, Math.max(1, Number(e.data.giorni) || 15));
      try { localStorage.setItem("gv-carta-" + SLUG, JSON.stringify({ carta: e.data.carta, fino: Date.now() + g * 864e5 })); } catch (err) {}
    }
  });
  $("scanClose").addEventListener("click", chiudi);
  document.addEventListener("visibilitychange", function () { if (document.hidden && stream) chiudi(); });
})();
