/* Tiny i18n: all UI text lives in i18n/{fi,sv,en}.json. */
(function () {
  const cache = {};
  const I = (SY.i18n = { lang: "fi", dict: {} });

  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; }
  }

  I.initialLang = function (fallback) {
    const q = new URLSearchParams(location.search).get("lang");
    const saved = store("syva-lang");
    const pick = [q, saved, fallback, "fi"].find((l) => SY.config.languages.includes(l));
    return pick;
  };

  I.load = async function (lang) {
    if (!cache[lang]) {
      const r = await fetch(`i18n/${lang}.json`);
      cache[lang] = await r.json();
    }
    I.lang = lang;
    I.dict = cache[lang];
    store("syva-lang", lang);
    document.documentElement.lang = lang;
  };

  I.t = function (key, vars) {
    let v = key.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), I.dict);
    if (v === undefined) v = key;
    if (vars) for (const k in vars) v = String(v).split(`{${k}}`).join(vars[k]);
    return v;
  };

  I.apply = function (root) {
    (root || document).querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = I.t(el.dataset.i18n); });
    (root || document).querySelectorAll("[data-i18n-attr]").forEach((el) => {
      el.dataset.i18nAttr.split(";").forEach((pair) => {
        const [attr, key] = pair.split(":");
        el.setAttribute(attr, I.t(key));
      });
    });
  };

  I.locale = () => SY.config.locales[I.lang] || "en-GB";

  I.date = function (iso, opts) {
    if (!iso) return "";
    const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
    return new Intl.DateTimeFormat(I.locale(), opts || { day: "numeric", month: "short", year: "numeric" }).format(d);
  };
  I.num = (n, d) => (n === null || n === undefined ? "—" : Number(n).toLocaleString(I.locale(), { maximumFractionDigits: d === undefined ? 1 : d }));
})();
