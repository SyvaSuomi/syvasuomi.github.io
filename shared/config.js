/* Map configuration. Change base maps here. */
window.SY = window.SY || {};
SY.config = {
  /* Base map shown first: MML Simple map (selkokartta). Falls back to the first free map when there is no MML key. */
  defaultBase: "selkokartta",
  /* Opacity of every base map (1 = solid). Slightly see-through so the site symbols stand out. */
  baseOpacity: 0.8,
  /* Finnish base maps (Maanmittauslaitos open WMTS). Used only when MML_API_KEY is set in
     src/config.py. {key} is filled in at run time. */
  mmlMaps: {
    selkokartta: { label: "base_selko", layer: "selkokartta", ext: "png" },
    taustakartta: { label: "base_tausta", layer: "taustakartta", ext: "png" },
    maastokartta: { label: "base_maasto", layer: "maastokartta", ext: "png" },
    ortokuva: { label: "base_orto", layer: "ortokuva", ext: "jpg" }
  },
  mmlUrl: "https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/{layer}/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.{ext}?api-key={key}",
  mmlAttribution: '&copy; <a href="https://www.maanmittauslaitos.fi/en/opendata-licence-cc40">Maanmittauslaitos</a> (CC BY 4.0)',

  /* Free base maps that need no API key (fallback when there is no MML key).
     (CARTO now requires a key, and tile.openstreetmap.org blocks apps.) */
  baseMaps: {
    gray: {
      label: "base_gray",
      layers: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
      ],
      attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
      maxZoom: 16
    },
    osm: {
      label: "base_osm",
      layers: ["https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"],
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, style <a href="https://www.hotosm.org/">HOT</a>, hosted by <a href="https://openstreetmap.fr/">OSM France</a>',
      subdomains: "abc", maxZoom: 19
    },
    satellite: {
      label: "base_satellite",
      layers: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
      ],
      attribution: 'Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community',
      maxZoom: 18
    }
  },
  /* Map view on opening: south-east Finland, Tampere to Joensuu and down to the coast, [[south, west], [north, east]].
     Move it when the survey moves to another area. */
  defaultBounds: [[60.2, 24.0], [63.15, 32.0]],
  /* Closest zoom allowed: 13.5 shows village names and lakes (e.g. Kähö, Lauttaniemi in Lappeenranta)
     but stops before the basemap gets close enough to follow a track to a site. */
  maxZoom: 13.5,
  statusColors: {
    lmt: "#16a34a", bbmt: "#1e3a8a", permitted: "#6b7280"
  },
  phoneQuery: "(max-width: 719px)",
  languages: ["fi", "sv", "en"],
  locales: { fi: "fi-FI", sv: "sv-FI", en: "en-GB" }
};
