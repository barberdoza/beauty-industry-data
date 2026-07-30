(function (global) {
  "use strict";

  global.STATES = {
    ny: {
      id: "ny",
      name: "New York",
      dataUrl: "data/ny_shops.json",
      geoKey: "city",
      geoLabel: "city",
      geoPlural: "cities",
      geoArticle: "a",
      stateDisplayName: "New York State",
      mapCenter: [42.9, -75.5],
      mapZoom: 7,
      features: { practitioners: true, growth: true, shopPins: true },
      categoryOrder: ["DOSBARSHOPOWNER", "DOSAEBUSINESS"],
      categoryTones: { DOSBARSHOPOWNER: "barber", DOSAEBUSINESS: "aeb" },
      hero: {
        eyebrow: "New York State · Active Business Licenses",
        title: 'New York beauty<br><span class="accent">industry data.</span>',
        tagline:
          "A city-by-city view of active licensed barbershops and appearance enhancement businesses across New York State.",
      },
      finder: {
        label: "Search by city",
        hint: "Filter establishments, map, rankings, and directory. Workforce totals use statewide or estimated city figures.",
        placeholder: "Try Rochester, Buffalo, or Albany",
        emptyHint: "Showing statewide totals until you pick a city.",
        selectedHint: (name) => `Showing ${name}. Clear the search to return to statewide view.`,
      },
      rank: {
        title: "Top cities by total shops",
        selectedTitle: (name) => `Top cities · ${name} highlighted`,
        sub: "Active business licenses with published city locations. Barbershops and appearance enhancement businesses combined.",
        more: (shown, total) =>
          `Showing top ${shown} of ${total} cities. Full list in the directory below.`,
      },
      directory: {
        kicker: "City directory",
        title: "Browse all cities",
        sub: "Verified shop counts plus estimated practitioner totals. Select a row to focus the dashboard.",
      },
      sampleBanner:
        "This is placeholder data, not the live New York registry. Run the Update NY shop data GitHub Action to replace it.",
      pageTitle: "New York Beauty Industry Data | Barber Doza",
      pageDescription:
        "Explore active New York barbershop and appearance enhancement business licenses by city in this Barber Doza industry data project.",
    },
    il: {
      id: "il",
      name: "Illinois",
      dataUrl: "data/il_shops.json",
      geoKey: "county",
      geoLabel: "county",
      geoPlural: "counties",
      geoArticle: "a",
      stateDisplayName: "Illinois",
      mapCenter: [40.0, -89.2],
      mapZoom: 6,
      features: { practitioners: false, growth: false, bubbles: true },
      categoryOrder: ["BARBER", "SALON_SHOP"],
      categoryTones: { BARBER: "barber", SALON_SHOP: "aeb" },
      hero: {
        eyebrow: "Illinois · Active Business Licenses",
        title: 'Illinois beauty<br><span class="accent">industry data.</span>',
        tagline:
          "A county-by-county view of active licensed barber and salon/shop registrations across Illinois.",
      },
      finder: {
        label: "Search by county",
        hint: "Filter establishments, map, rankings, and directory. IDFPR publishes county, not street addresses.",
        placeholder: "Try Cook, DuPage, or Sangamon",
        emptyHint: "Showing statewide totals until you pick a county.",
        selectedHint: (name) => `Showing ${name} County. Clear the search to return to statewide view.`,
      },
      rank: {
        title: "Top counties by total shops",
        selectedTitle: (name) => `Top counties · ${name} highlighted`,
        sub: "Active business licenses aggregated by county. Barber shops and salon/shop registrations combined.",
        more: (shown, total) =>
          `Showing top ${shown} of ${total} counties. Full list in the directory below.`,
      },
      directory: {
        kicker: "County directory",
        title: "Browse all counties",
        sub: "Verified shop counts by county. Select a row to focus the dashboard.",
      },
      sampleBanner:
        "This is placeholder data, not the live Illinois registry. Run the Illinois data fetch script to replace it.",
      pageTitle: "Illinois Beauty Industry Data | Barber Doza",
      pageDescription:
        "Explore active Illinois barber and salon/shop business licenses by county in this Barber Doza industry data project.",
    },
    tx: {
      id: "tx",
      name: "Texas",
      dataUrl: "data/tx_shops.json",
      geoKey: "county",
      geoLabel: "county",
      geoPlural: "counties",
      geoArticle: "a",
      stateDisplayName: "Texas",
      shopFormat: "texas",
      mapCenter: [31.0, -99.5],
      mapZoom: 6,
      features: { practitioners: false, growth: false, shopPins: true },
      categoryOrder: ["BARBER", "SALON", "UNSPLIT"],
      categoryTones: { BARBER: "barber", SALON: "aeb", UNSPLIT: "other" },
      hero: {
        eyebrow: "Texas · Active Business Licenses",
        title: 'Texas beauty<br><span class="accent">industry data.</span>',
        tagline:
          "A county-by-county view of active licensed barbering and cosmetology establishments across Texas, with geocoded shop locations.",
      },
      finder: {
        label: "Search by county",
        hint: "Filter establishments, map, rankings, and directory. Search a county to fly the map there.",
        placeholder: "Try Harris, Travis, or Dallas",
        emptyHint: "Showing statewide totals until you pick a county.",
        selectedHint: (name) => `Showing ${name} County. Clear the search to return to statewide view.`,
      },
      rank: {
        title: "Top counties by total shops",
        selectedTitle: (name) => `Top counties · ${name} highlighted`,
        sub: "Active business licenses aggregated by county. Legacy barber, salon, and full-service establishment categories combined.",
        more: (shown, total) =>
          `Showing top ${shown} of ${total} counties. Full list in the directory below.`,
      },
      directory: {
        kicker: "County directory",
        title: "Browse all counties",
        sub: "Verified shop counts by county and license category. Select a row to focus the dashboard.",
      },
      mapSub:
        "Zoom, pan, or search a county above. Pins cluster when zoomed out. Map coverage depends on successful address geocoding — see footer.",
      sampleBanner:
        "This is placeholder data, not the live TDLR registry. Run the Texas data fetch workflow to replace it.",
      pageTitle: "Texas Beauty Industry Data | Barber Doza",
      pageDescription:
        "Explore active Texas barbering and cosmetology establishment licenses by county in this Barber Doza industry data project.",
    },
    all: {
      id: "all",
      name: "All states",
      geoKey: "state",
      geoLabel: "state",
      geoPlural: "states",
      geoArticle: "a",
      stateDisplayName: "All tracked states",
      mapCenter: [39.5, -98.5],
      mapZoom: 4,
      features: { aggregate: true, practitioners: false, growth: false, stateMap: true, stackedRank: true },
      categoryOrder: ["barber", "salon"],
      categoryTones: { barber: "barber", salon: "aeb" },
      hero: {
        eyebrow: "Multi-state · Active Business Licenses",
        title: 'Beauty industry<br><span class="accent">across states.</span>',
        tagline:
          "Combined and comparable totals for New York, Illinois, and Texas — normalized across different state license categories.",
      },
      finder: {
        label: "Search by state",
        hint: "Filter the comparison table and chart. Each state uses its own local geography in the single-state views.",
        placeholder: "Try New York, Illinois, or Texas",
        emptyHint: "Showing combined totals across all tracked states.",
        selectedHint: (name) => `Showing ${name}. Clear the search to return to the combined view.`,
      },
      rank: {
        title: "States by total licensed shops",
        selectedTitle: (name) => `${name} · highlighted`,
        sub: "Normalized barber/barbershop vs. salon and full-service categories. Click a row to open that state's dashboard.",
        more: () => "Three states currently tracked. Open a state tab for city- or county-level detail.",
      },
      directory: {
        kicker: "State comparison",
        title: "Browse all tracked states",
        sub: "Combined shop totals with normalized categories. Select a row to open the full state dashboard.",
      },
      mapSub:
        "State-level bubbles sized by total active licensed shops. Open a state tab for city, county, or shop-level maps.",
      sampleBanner:
        "One or more state datasets are placeholder sample data. Run each state's data fetch workflow for live registry figures.",
      pageTitle: "Multi-State Beauty Industry Data | Barber Doza",
      pageDescription:
        "Compare active barber and beauty business license totals across New York, Illinois, and Texas in this Barber Doza industry data project.",
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
