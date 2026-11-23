// Lokale standaardconfiguratie. De deploy publiceert een versie met het AWS-eindpunt;
// deze laat sync uit zodat de app ook zonder server alles doet.
window.GALWAY_CONFIG = Object.freeze({
  api: "",
  room: "galway",
  key: "",
  syncIntervalMs: 20000,
});
