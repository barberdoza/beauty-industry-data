(function () {
  "use strict";

  const stateId = new URLSearchParams(window.location.search).get("state") || "ny";
  const cfg = window.STATES[stateId] || window.STATES.ny;

  const state = {
    data: null,
    selectedGeo: null,
    selectedPractitionerType: "cosmetologist",
    geoCentroids: null,
    practitionerByCity: null,
    map: null,
    clusterLayer: null,
    bubbleLayers: [],
  };

  const els = {
    heroEyebrow: document.getElementById("hero-eyebrow"),
    heroTitle: document.getElementById("hero-title"),
    heroTagline: document.getElementById("hero-tagline"),
    statePills: [...document.querySelectorAll(".state-pill")],
    search: document.getElementById("geo-search"),
    geoList: document.getElementById("geo-list"),
    finderLabel: document.getElementById("finder-label"),
    finderCopy: document.getElementById("finder-copy"),
    finderHint: document.getElementById("finder-hint"),
    overviewPanel: document.getElementById("overview-panel"),
    rankTitle: document.getElementById("rank-title"),
    rankSub: document.getElementById("rank-sub"),
    rankChart: document.getElementById("rank-chart"),
    growthTitle: document.getElementById("growth-title"),
    growthSub: document.getElementById("growth-sub"),
    growthChart: document.getElementById("growth-chart"),
    mapSub: document.getElementById("map-sub"),
    practitionerSub: document.getElementById("practitioner-sub"),
    practitionerTableBody: document.getElementById("practitioner-table-body"),
    practitionerLatestYearCol: document.getElementById("practitioner-latest-year-col"),
    practitionerTypeSelect: document.getElementById("practitioner-type-select"),
    practitionerGrowthChart: document.getElementById("practitioner-growth-chart"),
    practitionerGrowthMeta: document.getElementById("practitioner-growth-meta"),
    practitionerCityChart: document.getElementById("practitioner-city-chart"),
    directoryKicker: document.getElementById("directory-kicker"),
    directoryTitle: document.getElementById("directory-title"),
    directorySub: document.getElementById("directory-sub"),
    tableGeoCol: document.getElementById("table-geo-col"),
    tableCatACol: document.getElementById("table-cat-a-col"),
    tableCatBCol: document.getElementById("table-cat-b-col"),
    tableCatCCol: document.getElementById("table-cat-c-col"),
    tableBody: document.getElementById("data-table-body"),
    dataNotesBody: document.getElementById("data-notes-body"),
    dashNav: document.getElementById("dash-nav"),
    sampleBanner: document.getElementById("sample-banner"),
    sampleBannerText: document.getElementById("sample-banner-text"),
    unclassifiedBanner: document.getElementById("unclassified-banner"),
    unclassifiedText: document.getElementById("unclassified-text"),
    inProgressBanner: document.getElementById("in-progress-banner"),
    geocodeNote: document.getElementById("geocode-note"),
    geocodeLabel: document.getElementById("geocode-label"),
    sourceLabel: document.getElementById("source-label"),
    updatedLabel: document.getElementById("updated-label"),
  };

  const PRACTITIONER_TONES = {
    barber: "barber",
    barber_apprentice: "barber",
    cosmetologist: "cosm",
    esthetician: "esth",
    nail_specialist: "nail",
    waxing: "wax",
    natural_hair: "hair",
    other: "other",
  };

  const PRACTITIONER_ORDER = [
    "barber",
    "barber_apprentice",
    "cosmetologist",
    "esthetician",
    "nail_specialist",
    "waxing",
    "natural_hair",
    "other",
  ];

  function geoKey() {
    return cfg.geoKey;
  }

  function geoName(row) {
    return row[geoKey()];
  }

  function geoDisplayName(name) {
    if (!name) return cfg.stateDisplayName;
    if (cfg.features.aggregate) return name;
    return cfg.geoKey === "county" ? `${name} County` : name;
  }

  function fmtNumber(n) {
    if (n === null || n === undefined) return "—";
    return n.toLocaleString("en-US");
  }

  function fmtPercent(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(1)}%`;
  }

  function categoryLabel(code) {
    return (state.data.categories && state.data.categories[code]) || code;
  }

  function practitionerLabel(key) {
    return (state.data.practitioner_categories && state.data.practitioner_categories[key]) || key;
  }

  function iterShops(callback) {
    if (!state.data.shops) return;
    if (cfg.shopFormat === "texas") {
      state.data.shops.forEach(([name, category, subtype, address, city, county, zip, lat, lon]) => {
        callback({ name, category, subtype, address, city, county, zip, lat, lon });
      });
      return;
    }
    state.data.shops.forEach(([name, category, address, city, zip, lat, lon]) => {
      callback({ name, category, address, city, zip, lat, lon });
    });
  }

  function tableColumnCount() {
    return 1 + cfg.categoryOrder.length + 1 + (cfg.features.practitioners ? 1 : 0);
  }

  function findRollup(name) {
    const q = name.trim().toLowerCase();
    if (!q) return null;
    const key = geoKey();
    return (
      state.data.rollup.find((r) => r[key].toLowerCase() === q) ||
      state.data.rollup.find((r) => r[key].toLowerCase().startsWith(q)) ||
      null
    );
  }

  function statewideTotals() {
    const totals = { total: 0 };
    cfg.categoryOrder.forEach((code) => (totals[code] = 0));
    state.data.rollup.forEach((r) => {
      totals.total += r.total;
      cfg.categoryOrder.forEach((code) => {
        totals[code] += r[code] || 0;
      });
    });
    return totals;
  }

  function growthSeries() {
    if (!state.data.growth) return [];
    const geo = state.selectedGeo;
    if (geo && state.data.growth_by_city && state.data.growth_by_city[geo]) {
      return state.data.growth_by_city[geo];
    }
    return state.data.growth;
  }

  function practitionerGrowthSeries() {
    return state.data.practitioner_growth || [];
  }

  function yoyChange(current, previous) {
    if (!previous) return null;
    return ((current - previous) / previous) * 100;
  }

  function isPartialYear(year) {
    return year === new Date().getFullYear();
  }

  function latestEstablishmentYearStats() {
    const series = growthSeries().filter((row) => (state.data.growth_baseline_year || 2014) < row.year);
    const complete = series.filter((row) => !isPartialYear(row.year));
    return { latest: complete[complete.length - 1], prior: complete[complete.length - 2] };
  }

  function latestPractitionerYearStats() {
    const currentYear = new Date().getFullYear();
    const series = practitionerGrowthSeries().filter((row) => row.year <= currentYear && !isPartialYear(row.year));
    return { latest: series[series.length - 1], prior: series[series.length - 2], series };
  }

  function practitionerCityEstimates() {
    if (state.data.practitioner_city_estimates) {
      return state.data.practitioner_city_estimates;
    }
    if (!state.data.practitioner_totals || !state.data.rollup) return [];

    const totals = state.data.practitioner_totals;
    const stateBarberShops = state.data.rollup.reduce((sum, row) => sum + (row.DOSBARSHOPOWNER || 0), 0) || 1;
    const stateAeb = state.data.rollup.reduce((sum, row) => sum + (row.DOSAEBUSINESS || 0), 0) || 1;
    const barberKeys = ["barber", "barber_apprentice"];
    const aebKeys = ["cosmetologist", "esthetician", "nail_specialist", "waxing", "natural_hair", "other"];

    return state.data.rollup
      .map((row) => {
        const entry = { city: row.city };
        barberKeys.forEach((key) => {
          entry[key] = Math.round(((row.DOSBARSHOPOWNER || 0) / stateBarberShops) * (totals[key] || 0));
        });
        aebKeys.forEach((key) => {
          entry[key] = Math.round(((row.DOSAEBUSINESS || 0) / stateAeb) * (totals[key] || 0));
        });
        entry.total = [...barberKeys, ...aebKeys].reduce((sum, key) => sum + (entry[key] || 0), 0);
        return entry;
      })
      .sort((a, b) => b.total - a.total);
  }

  function buildPractitionerCityMap() {
    state.practitionerByCity = {};
    practitionerCityEstimates().forEach((row) => {
      state.practitionerByCity[row.city] = row;
    });
  }

  function practitionerTotalForCity(cityName) {
    if (!cityName) {
      return Object.values(state.data.practitioner_totals || {}).reduce((sum, n) => sum + n, 0);
    }
    const row = state.practitionerByCity && state.practitionerByCity[cityName];
    return row ? row.total : null;
  }

  function applyStateChrome() {
    document.title = cfg.pageTitle;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", cfg.pageDescription);

    if (els.heroEyebrow) els.heroEyebrow.textContent = cfg.hero.eyebrow;
    if (els.heroTitle) els.heroTitle.innerHTML = cfg.hero.title;
    if (els.heroTagline) els.heroTagline.textContent = cfg.hero.tagline;

    els.statePills.forEach((pill) => {
      pill.classList.toggle("is-active", pill.dataset.state === cfg.id);
    });

    if (els.finderLabel) els.finderLabel.textContent = cfg.finder.label;
    if (els.finderCopy) els.finderCopy.textContent = cfg.finder.hint;
    if (els.search) els.search.placeholder = cfg.finder.placeholder;
    if (els.finderHint) els.finderHint.textContent = cfg.finder.emptyHint;
    if (els.rankSub) els.rankSub.textContent = cfg.rank.sub;
    if (els.directoryKicker) els.directoryKicker.textContent = cfg.directory.kicker;
    if (els.directoryTitle) els.directoryTitle.textContent = cfg.directory.title;
    if (els.directorySub) els.directorySub.textContent = cfg.directory.sub;

    const catA = cfg.categoryOrder[0];
    const catB = cfg.categoryOrder[1];
    const catC = cfg.categoryOrder[2];
    if (els.tableGeoCol) els.tableGeoCol.textContent = cfg.geoLabel[0].toUpperCase() + cfg.geoLabel.slice(1);
    if (els.tableCatACol) els.tableCatACol.textContent = categoryLabel(catA);
    if (els.tableCatBCol) {
      if (cfg.id === "il" || cfg.id === "tx") {
        els.tableCatBCol.textContent = categoryLabel(catB);
      } else {
        els.tableCatBCol.innerHTML =
          `${categoryLabel(catB)}<br /><span class="th-sub">salons, nails, esthetics, and more</span>`;
      }
    }
    if (els.tableCatCCol) {
      if (catC && !cfg.features.aggregate) {
        els.tableCatCCol.hidden = false;
        els.tableCatCCol.textContent = categoryLabel(catC);
      } else if (els.tableCatCCol) {
        els.tableCatCCol.hidden = true;
      }
    }

    if (els.tableCatACol && cfg.features.aggregate) {
      els.tableCatACol.textContent = "Barber / barbershop";
    }
    if (els.tableCatBCol && cfg.features.aggregate) {
      els.tableCatBCol.textContent = "Salon & full-service";
    }

    if (els.geocodeNote) {
      const showGeocode = cfg.id === "tx";
      els.geocodeNote.hidden = !showGeocode;
      els.geocodeNote.classList.toggle("feature-hidden", !showGeocode);
    }

    if (els.search) {
      els.search.disabled = false;
    }

    document.querySelectorAll(".feature-practitioners, .feature-growth").forEach((node) => {
      const showPractitioners = node.classList.contains("feature-practitioners") && cfg.features.practitioners;
      const showGrowth = node.classList.contains("feature-growth") && cfg.features.growth;
      const show = showPractitioners || showGrowth;
      node.classList.toggle("feature-hidden", !show);
      if (show) node.removeAttribute("hidden");
      else node.setAttribute("hidden", "");
    });

    if (els.mapSub) {
      els.mapSub.textContent =
        cfg.mapSub ||
        (cfg.features.shopPins
          ? "Zoom, pan, or search above. Pins cluster automatically when zoomed out."
          : "County bubbles sized by active shop count. IDFPR does not publish street addresses.");
    }

    if (els.sampleBannerText) els.sampleBannerText.textContent = cfg.sampleBanner;
  }

  function renderOverviewNy(sel, shopTotals) {
    const practitionerTotal = practitionerTotalForCity(state.selectedGeo);
    const practitionerScope = state.selectedGeo ? "Estimated for this city" : "Statewide active total";
    const cityPrac = state.selectedGeo && state.practitionerByCity?.[state.selectedGeo];
    const barberDisplay = cityPrac
      ? (cityPrac.barber || 0) + (cityPrac.barber_apprentice || 0)
      : state.data.practitioner_totals?.barber || 0;
    const cosmDisplay = cityPrac ? cityPrac.cosmetologist || 0 : state.data.practitioner_totals?.cosmetologist || 0;
    const esthDisplay = cityPrac ? cityPrac.esthetician || 0 : state.data.practitioner_totals?.esthetician || 0;

    const est = latestEstablishmentYearStats();
    const prac = latestPractitionerYearStats();
    const estYoY = est.latest && est.prior ? yoyChange(est.latest.total, est.prior.total) : null;
    const pracYoY = prac.latest && prac.prior ? yoyChange(prac.latest.total, prac.prior.total) : null;
    const estYoYClass = estYoY == null ? "" : estYoY >= 0 ? " is-up" : " is-down";
    const pracYoYClass = pracYoY == null ? "" : pracYoY >= 0 ? " is-up" : " is-down";

    const [catA, catB] = cfg.categoryOrder;

    return `
      <div class="overview-grid">
        <article class="overview-card overview-card-verified">
          <span class="overview-tag">Verified · Establishments</span>
          <p class="overview-stat-value">${fmtNumber(shopTotals.total)}</p>
          <p class="overview-stat-label">Active licensed shops</p>
          <dl class="overview-breakdown">
            <div><dt>${categoryLabel(catA)}</dt><dd>${fmtNumber(shopTotals[catA] || 0)}</dd></div>
            <div><dt>${categoryLabel(catB)}</dt><dd>${fmtNumber(shopTotals[catB] || 0)}</dd></div>
          </dl>
          ${est.latest ? `<p class="overview-yoy${estYoYClass}">${est.latest.year} new shops: ${fmtNumber(est.latest.total)} · ${fmtPercent(estYoY)} YoY</p>` : ""}
        </article>
        <article class="overview-card overview-card-estimated">
          <span class="overview-tag">Workforce · Individual licenses</span>
          <p class="overview-stat-value">${fmtNumber(practitionerTotal)}</p>
          <p class="overview-stat-label">${practitionerScope}</p>
          <dl class="overview-breakdown">
            <div><dt>Barbers</dt><dd>${fmtNumber(barberDisplay)}</dd></div>
            <div><dt>Cosmetologists</dt><dd>${fmtNumber(cosmDisplay)}</dd></div>
            <div><dt>Estheticians</dt><dd>${fmtNumber(esthDisplay)}</dd></div>
          </dl>
          ${prac.latest ? `<p class="overview-yoy${pracYoYClass}">${prac.latest.year} new licenses: ${fmtNumber(prac.latest.total)} · ${fmtPercent(pracYoY)} YoY statewide</p>` : ""}
        </article>
      </div>`;
  }

  function renderOverviewAggregate(sel, shopTotals) {
    const combined = state.data.combined || shopTotals;
    const stateCards = state.data.rollup
      .map(
        (row) => `
        <a class="state-compare-card${state.selectedGeo === row.state ? " is-current" : ""}" href="?state=${row.stateId}">
          <span class="state-compare-name">${row.state}</span>
          <span class="state-compare-value">${fmtNumber(row.total)}</span>
          <span class="state-compare-meta">${fmtNumber(row.geoCount)} ${row.geoLabel}</span>
          <span class="state-compare-link">Open dashboard →</span>
        </a>`
      )
      .join("");

    const practitionerNote =
      state.data.practitioner_total_ny != null
        ? `<p class="overview-note">New York also publishes ${fmtNumber(state.data.practitioner_total_ny)} active individual practitioner licenses statewide — not included in shop totals above.</p>`
        : "";

    return `
      <div class="overview-grid overview-grid-single overview-grid-wide">
        <article class="overview-card overview-card-verified">
          <span class="overview-tag">Combined · Establishments</span>
          <p class="overview-stat-value">${fmtNumber(combined.total)}</p>
          <p class="overview-stat-label">Active licensed shops across NY, IL, and TX</p>
          <dl class="overview-breakdown">
            <div class="overview-breakdown-row"><dt>Barber / barbershop</dt><dd>${fmtNumber(combined.barber)}</dd></div>
            <div class="overview-breakdown-row"><dt>Salon & full-service</dt><dd>${fmtNumber(combined.salon)}</dd></div>
          </dl>
          ${practitionerNote}
        </article>
      </div>
      <div class="state-compare-grid">${stateCards}</div>`;
  }

  function renderOverviewSimple(sel, shopTotals) {
    const boards = cfg.categoryOrder
      .map(
        (code) => `
        <div class="overview-breakdown-row">
          <dt>${categoryLabel(code)}</dt>
          <dd>${fmtNumber(shopTotals[code] || 0)}</dd>
        </div>`
      )
      .join("");

    return `
      <div class="overview-grid overview-grid-single${cfg.categoryOrder.length > 2 ? " overview-grid-wide" : ""}">
        <article class="overview-card overview-card-verified">
          <span class="overview-tag">Verified · Establishments</span>
          <p class="overview-stat-value">${fmtNumber(shopTotals.total)}</p>
          <p class="overview-stat-label">Active licensed shops</p>
          <dl class="overview-breakdown">${boards}</dl>
        </article>
      </div>`;
  }

  function renderOverview() {
    const sel = state.selectedGeo ? findRollup(state.selectedGeo) : null;
    const title = geoDisplayName(sel ? geoName(sel) : null);
    const shopTotals = sel || statewideTotals();

    let rankBadge = "";
    if (sel) {
      const sorted = [...state.data.rollup].sort((a, b) => b.total - a.total);
      const rank = sorted.findIndex((r) => geoName(r) === geoName(sel)) + 1;
      rankBadge = `<span class="rank-badge">#${rank} of ${sorted.length} ${cfg.geoPlural} by shops</span>`;
    }

    const body = cfg.features.aggregate
      ? renderOverviewAggregate(sel, shopTotals)
      : cfg.features.practitioners
        ? renderOverviewNy(sel, shopTotals)
        : renderOverviewSimple(sel, shopTotals);

    els.overviewPanel.innerHTML = `
      <div class="overview-heading">
        <h2>${title}</h2>
        ${rankBadge}
      </div>
      ${body}
    `;
  }

  function renderGrowth() {
    if (!cfg.features.growth || !els.growthChart) return;

    const series = growthSeries();
    if (!series.length) {
      els.growthChart.innerHTML = `<p class="muted">Growth data is not available yet.</p>`;
      return;
    }

    const baselineYear = state.data.growth_baseline_year || 2014;
    const chartYears = series.filter((row) => row.year > baselineYear);
    const max = Math.max(...chartYears.map((row) => row.total), 1);

    els.growthTitle.textContent = state.selectedGeo
      ? `New establishment licenses in ${geoDisplayName(state.selectedGeo)}`
      : "New establishment licenses by year";
    els.growthSub.textContent = state.selectedGeo
      ? `Original license issue year for active shops in this ${cfg.geoLabel}.`
      : "Original license issue year for currently active shop locations statewide.";

    els.growthChart.innerHTML = chartYears
      .map((row, index) => {
        const prev = chartYears[index - 1];
        const change = prev ? yoyChange(row.total, prev.total) : null;
        const changeClass = change == null ? "" : change >= 0 ? " is-up" : " is-down";
        const partialClass = isPartialYear(row.year) ? " is-partial" : "";
        const segments = cfg.categoryOrder
          .map((code) => {
            const value = row[code] || 0;
            const width = row.total ? (value / row.total) * (row.total / max) * 100 : 0;
            const tone = cfg.categoryTones[code] || "aeb";
            return `<div class="growth-segment growth-segment-${tone}" style="width:${width}%"></div>`;
          })
          .join("");

        return `
          <div class="growth-row${partialClass}">
            <div class="growth-year">${row.year}${isPartialYear(row.year) ? " YTD" : ""}</div>
            <div class="growth-bar-track">${segments}</div>
            <div class="growth-value">${fmtNumber(row.total)}</div>
            <div class="growth-yoy${changeClass}">${index === 0 ? "—" : fmtPercent(change)}</div>
          </div>`;
      })
      .join("");

    els.growthChart.insertAdjacentHTML(
      "beforeend",
      `<div class="growth-legend">
        ${cfg.categoryOrder
          .map((code) => {
            const tone = cfg.categoryTones[code] || "aeb";
            return `<span><i class="growth-swatch growth-swatch-${tone}"></i>${categoryLabel(code)}</span>`;
          })
          .join("")}
      </div>`
    );
  }

  function renderPractitionerTypeSelect(keys) {
    if (!els.practitionerTypeSelect) return;
    const visibleKeys = keys.filter((key) => (state.data.practitioner_totals[key] || 0) > 0);
    if (!visibleKeys.includes(state.selectedPractitionerType)) {
      state.selectedPractitionerType = visibleKeys[0] || "cosmetologist";
    }
    els.practitionerTypeSelect.innerHTML = visibleKeys
      .map(
        (key) =>
          `<option value="${key}"${key === state.selectedPractitionerType ? " selected" : ""}>${practitionerLabel(key)}</option>`
      )
      .join("");
  }

  function renderPractitionerGrowthChart() {
    const key = state.selectedPractitionerType;
    const series = practitionerGrowthSeries();
    if (!series.length || !els.practitionerGrowthChart) return;

    const chartYears = series.filter((row) => row.year >= 2015 && row.year <= new Date().getFullYear());
    const values = chartYears.map((row) => row[key] || 0);
    const max = Math.max(...values, 1);
    const tone = PRACTITIONER_TONES[key] || "other";
    const completeYears = chartYears.filter((row) => !isPartialYear(row.year));
    const latest = completeYears[completeYears.length - 1];
    const prior = completeYears[completeYears.length - 2];
    const latestVal = latest ? latest[key] || 0 : 0;
    const priorVal = prior ? prior[key] || 0 : 0;
    const latestYoY = priorVal ? yoyChange(latestVal, priorVal) : null;
    const yoyClass = latestYoY == null ? "" : latestYoY >= 0 ? " is-up" : " is-down";

    if (els.practitionerGrowthMeta) {
      els.practitionerGrowthMeta.innerHTML = `
        <span>${fmtNumber(state.data.practitioner_totals[key] || 0)} active statewide</span>
        ${latest ? `<span> · ${latest.year}: ${fmtNumber(latestVal)} new</span>` : ""}
        ${latestYoY != null ? `<span class="growth-yoy${yoyClass}"> · ${fmtPercent(latestYoY)} YoY</span>` : ""}
      `;
    }

    els.practitionerGrowthChart.innerHTML = chartYears
      .map((row, index) => {
        const value = row[key] || 0;
        const prev = chartYears[index - 1];
        const prevVal = prev ? prev[key] || 0 : 0;
        const change = prevVal ? yoyChange(value, prevVal) : null;
        const changeClass = change == null ? "" : change >= 0 ? " is-up" : " is-down";
        const partialClass = isPartialYear(row.year) ? " is-partial" : "";
        const width = Math.max(value ? (value / max) * 100 : 0, value ? 2 : 0);

        return `
          <div class="growth-row type-growth-row${partialClass}">
            <div class="growth-year">${row.year}${isPartialYear(row.year) ? " YTD" : ""}</div>
            <div class="growth-bar-track">
              <div class="growth-segment growth-segment-${tone}" style="width:${width}%"></div>
            </div>
            <div class="growth-value">${fmtNumber(value)}</div>
            <div class="growth-yoy${changeClass}">${index === 0 ? "—" : fmtPercent(change)}</div>
          </div>`;
      })
      .join("");
  }

  function renderPractitionerCityChart(keys) {
    if (!els.practitionerCityChart) return;

    const ranked = practitionerCityEstimates();
    if (!ranked.length) {
      els.practitionerCityChart.innerHTML = `<p class="muted">City practitioner estimates are not available yet.</p>`;
      return;
    }

    const visibleKeys = keys.filter((key) => (state.data.practitioner_totals[key] || 0) > 0);
    const max = ranked[0] ? ranked[0].total : 1;
    const showCount = 15;
    let list = ranked.slice(0, showCount);

    if (state.selectedGeo) {
      const sel = ranked.find((row) => row.city === state.selectedGeo);
      if (sel && !list.find((row) => row.city === sel.city)) list = list.concat([sel]);
    }

    els.practitionerCityChart.innerHTML = list
      .map((row) => {
        const isCurrent =
          state.selectedGeo && row.city.toLowerCase() === state.selectedGeo.trim().toLowerCase();
        const barWidth = Math.max(2, (row.total / max) * 100);
        const segments = visibleKeys
          .map((k) => {
            const value = row[k] || 0;
            if (!value || !row.total) return "";
            const width = (value / row.total) * barWidth;
            const tone = PRACTITIONER_TONES[k] || "other";
            return `<div class="rank-bar-segment rank-bar-segment-${tone}" style="width:${width}%" title="${practitionerLabel(k)}: ${fmtNumber(value)}"></div>`;
          })
          .join("");

        return `
          <div class="rank-row practitioner-city-row${isCurrent ? " is-current" : ""}">
            <div class="rank-name">${row.city}</div>
            <div class="rank-bar-track rank-bar-track-stacked">${segments}</div>
            <div class="rank-value">${fmtNumber(row.total)}</div>
          </div>`;
      })
      .join("");

    const legendItems = visibleKeys
      .map((k) => {
        const tone = PRACTITIONER_TONES[k] || "other";
        return `<span><i class="growth-swatch growth-swatch-${tone}"></i>${practitionerLabel(k)}</span>`;
      })
      .join("");

    els.practitionerCityChart.insertAdjacentHTML("beforeend", `<div class="growth-legend">${legendItems}</div>`);

    if (ranked.length > showCount) {
      const more = document.createElement("p");
      more.className = "rank-more";
      more.textContent = `Showing top ${showCount} of ${ranked.length} cities by estimated practitioner workforce.`;
      els.practitionerCityChart.appendChild(more);
    }
  }

  function renderPractitioners() {
    if (!cfg.features.practitioners) return;

    if (!state.data.practitioner_totals || !state.data.practitioner_categories) {
      if (els.practitionerTableBody) {
        els.practitionerTableBody.innerHTML = `<tr><td colspan="4">Practitioner data is not available yet.</td></tr>`;
      }
      return;
    }

    const { latest, prior } = latestPractitionerYearStats();
    if (latest && els.practitionerLatestYearCol) {
      els.practitionerLatestYearCol.textContent = `${latest.year} new`;
    }

    const keys = PRACTITIONER_ORDER.filter((key) => state.data.practitioner_categories[key]);
    els.practitionerTableBody.innerHTML = keys
      .map((key) => {
        const active = state.data.practitioner_totals[key] || 0;
        const latestNew = latest ? latest[key] || 0 : 0;
        const priorNew = prior ? prior[key] || 0 : 0;
        const change = priorNew ? yoyChange(latestNew, priorNew) : null;
        const changeClass = change == null ? "" : change >= 0 ? " is-up" : " is-down";
        if (active === 0 && latestNew === 0) return "";
        return `
          <tr>
            <td>${practitionerLabel(key)}</td>
            <td>${fmtNumber(active)}</td>
            <td>${fmtNumber(latestNew)}</td>
            <td class="growth-yoy${changeClass}">${fmtPercent(change)}</td>
          </tr>`;
      })
      .join("");

    const totalActive = keys.reduce((sum, key) => sum + (state.data.practitioner_totals[key] || 0), 0);
    const totalLatest = latest ? latest.total || 0 : 0;
    const totalPrior = prior ? prior.total || 0 : 0;
    const totalChange = totalPrior ? yoyChange(totalLatest, totalPrior) : null;
    const totalChangeClass = totalChange == null ? "" : totalChange >= 0 ? " is-up" : " is-down";
    els.practitionerTableBody.insertAdjacentHTML(
      "beforeend",
      `<tr class="practitioner-total-row">
        <td>All practitioners</td>
        <td>${fmtNumber(totalActive)}</td>
        <td>${fmtNumber(totalLatest)}</td>
        <td class="growth-yoy${totalChangeClass}">${fmtPercent(totalChange)}</td>
      </tr>`
    );

    renderPractitionerTypeSelect(keys);
    renderPractitionerGrowthChart();
    renderPractitionerCityChart(keys);
  }

  function renderRankChart() {
    const ranked = [...state.data.rollup].sort((a, b) => b.total - a.total);
    const max = ranked[0] ? ranked[0].total : 1;
    const showCount = 15;
    let list = ranked.slice(0, showCount);
    const key = geoKey();

    if (state.selectedGeo) {
      const sel = findRollup(state.selectedGeo);
      if (sel && !list.find((r) => geoName(r) === geoName(sel))) list = list.concat([sel]);
    }

    els.rankTitle.textContent = state.selectedGeo
      ? cfg.rank.selectedTitle(state.selectedGeo)
      : cfg.rank.title;

    els.rankChart.innerHTML = list
      .map((r) => {
        const pct = Math.max(2, (r.total / max) * 100);
        const isCurrent =
          state.selectedGeo && geoName(r).toLowerCase() === state.selectedGeo.trim().toLowerCase();

        if (cfg.features.stackedRank) {
          const barWidth = pct;
          const segments = cfg.categoryOrder
            .map((code) => {
              const value = r[code] || 0;
              if (!value || !r.total) return "";
              const width = (value / r.total) * barWidth;
              const tone = cfg.categoryTones[code] || "aeb";
              return `<div class="rank-bar-segment rank-bar-segment-${tone}" style="width:${width}%" title="${categoryLabel(code)}: ${fmtNumber(value)}"></div>`;
            })
            .join("");
          return `
          <div class="rank-row${isCurrent ? " is-current" : ""}">
            <div class="rank-name">${geoName(r)}</div>
            <div class="rank-bar-track rank-bar-track-stacked">${segments}</div>
            <div class="rank-value">${fmtNumber(r.total)}</div>
          </div>`;
        }

        return `
          <div class="rank-row${isCurrent ? " is-current" : ""}">
            <div class="rank-name">${geoName(r)}</div>
            <div class="rank-bar-track"><div class="rank-bar-fill" style="width:${pct}%"></div></div>
            <div class="rank-value">${fmtNumber(r.total)}</div>
          </div>`;
      })
      .join("");

    if (cfg.features.stackedRank) {
      els.rankChart.insertAdjacentHTML(
        "beforeend",
        `<div class="growth-legend">
          <span><i class="growth-swatch growth-swatch-barber"></i>${categoryLabel("barber")}</span>
          <span><i class="growth-swatch growth-swatch-aeb"></i>${categoryLabel("salon")}</span>
        </div>`
      );
    }

    if (ranked.length > showCount) {
      const more = document.createElement("p");
      more.className = "rank-more";
      more.textContent = cfg.rank.more(showCount, ranked.length);
      els.rankChart.appendChild(more);
    }
  }

  function renderTable() {
    const query = els.search.value.trim().toLowerCase();
    const colSpan = tableColumnCount();

    const rows = state.data.rollup
      .filter((r) => !query || geoName(r).toLowerCase().includes(query))
      .map((r) => {
        const name = geoName(r);
        const isCurrent = state.selectedGeo && name.toLowerCase() === state.selectedGeo.trim().toLowerCase();
        const estPractitioners = state.practitionerByCity?.[name]?.total;
        const categoryCells = cfg.categoryOrder
          .map((code) => `<td>${fmtNumber(r[code] || 0)}</td>`)
          .join("");
        const practitionerCell = cfg.features.practitioners
          ? `<td class="td-est">${fmtNumber(estPractitioners)}</td>`
          : "";
        const geoMeta =
          cfg.features.aggregate && r.geoCount
            ? `<span class="td-sub">${fmtNumber(r.geoCount)} ${r.geoLabel}</span>`
            : "";
        return `
          <tr class="${isCurrent ? "is-current-row" : ""}" data-geo="${name}"${r.stateId ? ` data-state-id="${r.stateId}"` : ""}>
            <td>${name}${geoMeta ? `<br />${geoMeta}` : ""}</td>
            ${categoryCells}
            <td class="td-total">${fmtNumber(r.total)}</td>
            ${practitionerCell}
          </tr>`;
      })
      .join("");

    els.tableBody.innerHTML =
      rows || `<tr><td colspan="${colSpan}">No ${cfg.geoPlural} match "${els.search.value}".</td></tr>`;
  }

  function renderDataNotes() {
    if (!els.dataNotesBody) return;

    const notes =
      cfg.features.aggregate
        ? [
            { title: "Combined totals", body: state.data.aggregate_note },
            { title: "Geography", body: state.data.geography_note },
            { title: "Practitioner data", body: state.data.practitioner_note },
            {
              title: "Sources",
              body: state.data.rollup
                .map((row) => `<strong>${row.state}:</strong> ${row.source}`)
                .join("<br />"),
            },
          ].filter((note) => note.body)
        : cfg.id === "il"
        ? [
            {
              title: "County-level counts",
              body:
                "Illinois IDFPR publishes active business licenses with county but not street addresses, so this dashboard aggregates at the county level rather than mapping individual shop pins.",
            },
            {
              title: "License categories",
              body:
                "Most active records are Salon/Shop Registration licenses covering cosmetology, esthetics, nail technology, and barbering together. Separate barber shop descriptions are counted when IDFPR lists them distinctly.",
            },
            state.data.excluded_school_or_ce_records
              ? {
                  title: "Excluded records",
                  body: `${fmtNumber(state.data.excluded_school_or_ce_records)} school or continuing-education records were excluded from shop totals.`,
                }
              : null,
            Object.keys(state.data.unclassified_license_types || {}).length
              ? {
                  title: "Unclassified license types",
                  body:
                    "A small number of records had license descriptions this app did not recognize. They are counted in totals but flagged above for review.",
                }
              : null,
          ].filter(Boolean)
        : cfg.id === "tx"
          ? [
              {
                title: "County rollup vs. shop map",
                body:
                  "Totals and rankings use county rollups from the Texas TDLR open data registry. The map plots individually geocoded shop addresses where geocoding succeeded.",
              },
              {
                title: "License categories",
                body:
                  "TDLR uses legacy barber and salon labels alongside combined full-service establishment types. Unrecognized license types are counted rather than dropped.",
              },
              state.data.geocode_coverage
                ? {
                    title: "Map coverage",
                    body: `${fmtNumber(state.data.geocode_coverage.geocoded)} of ${fmtNumber(state.data.geocode_coverage.total)} shops (${Math.round((state.data.geocode_coverage.geocoded / state.data.geocode_coverage.total) * 100)}%) have mappable coordinates.`,
                  }
                : null,
              state.data.excluded_school_or_instructor_records
                ? {
                    title: "Excluded records",
                    body: `${fmtNumber(state.data.excluded_school_or_instructor_records)} school or instructor records were excluded from shop totals.`,
                  }
                : null,
            ].filter(Boolean)
          : [
            { title: "Establishment counts", body: state.data.growth_note },
            {
              title: "Establishment growth",
              body: "New shop counts use original license issue dates among currently active locations. Area renters are excluded from shop totals to avoid double-counting addresses.",
            },
            {
              title: "Practitioner totals",
              body: "Individual license counts come from a separate NY open data registry. Practitioner home or work cities are not published.",
            },
            { title: "Practitioner growth", body: state.data.practitioner_growth_note },
            { title: "City practitioner estimates", body: state.data.practitioner_city_note },
            { title: "Verified area renters", body: state.data.renter_note },
          ].filter((note) => note.body);

    els.dataNotesBody.innerHTML = notes
      .map((note) => `<div class="data-note"><h3>${note.title}</h3><p>${note.body}</p></div>`)
      .join("");
  }

  function computeGeoCentroidsFromShops() {
    const sums = {};
    const geoField = cfg.geoKey === "county" ? "county" : "city";
    iterShops((shop) => {
      if (shop.lat == null || shop.lon == null) return;
      const geo = shop[geoField];
      if (!geo) return;
      const b = sums[geo] || (sums[geo] = { lat: 0, lon: 0, n: 0 });
      b.lat += shop.lat;
      b.lon += shop.lon;
      b.n += 1;
    });
    const out = {};
    Object.entries(sums).forEach(([geo, b]) => {
      out[geo] = { lat: b.lat / b.n, lon: b.lon / b.n };
    });
    return out;
  }

  function computeGeoCentroidsFromRollup() {
    const out = {};
    state.data.rollup.forEach((row) => {
      if (row.lat == null || row.lon == null) return;
      out[geoName(row)] = { lat: row.lat, lon: row.lon };
    });
    return out;
  }

  function radiusFor(total, maxTotal) {
    const minR = 4;
    const maxR = 40;
    const scale = Math.sqrt(total / maxTotal || 0);
    return Math.max(minR, scale * maxR);
  }

  function buildMap() {
    state.map = L.map("map", { scrollWheelZoom: true }).setView(cfg.mapCenter, cfg.mapZoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(state.map);

    if (cfg.features.shopPins && state.data.shops) {
      state.clusterLayer = L.markerClusterGroup({ maxClusterRadius: 50 });
      iterShops((shop) => {
        if (shop.lat == null || shop.lon == null) return;
        const marker = L.marker([shop.lat, shop.lon]);
        if (cfg.shopFormat === "texas") {
          marker.bindPopup(
            `<div class="shop-popup"><strong>${escapeHtml(shop.name)}</strong><br />
             <span class="shop-popup-cat">${escapeHtml(categoryLabel(shop.category))}</span><br />
             ${escapeHtml(shop.address)}, ${escapeHtml(shop.city)}, ${escapeHtml(shop.county)} County ${escapeHtml(shop.zip)}</div>`
          );
        } else {
          marker.bindPopup(
            `<div class="shop-popup"><strong>${escapeHtml(shop.name)}</strong><br />
             <span class="shop-popup-cat">${escapeHtml(categoryLabel(shop.category))}</span><br />
             ${escapeHtml(shop.address)}, ${escapeHtml(shop.city)} ${escapeHtml(shop.zip)}</div>`
          );
        }
        state.clusterLayer.addLayer(marker);
      });
      state.map.addLayer(state.clusterLayer);
      return;
    }

    if (cfg.features.stateMap) {
      const maxTotal = Math.max(...state.data.rollup.map((r) => r.total), 1);
      state.bubbleLayers = [];
      state.data.rollup.forEach((r) => {
        if (r.lat == null || r.lon == null) return;
        const circle = L.circleMarker([r.lat, r.lon], {
          radius: radiusFor(r.total, maxTotal),
          color: "#183E43",
          weight: 1,
          fillColor: "#C79A3E",
          fillOpacity: 0.65,
        }).addTo(state.map);
        circle.bindPopup(
          `<strong>${geoName(r)}</strong><br />${fmtNumber(r.total)} active licensed shops<br /><a href="?state=${r.stateId}">Open ${geoName(r)} dashboard</a>`
        );
        state.bubbleLayers.push(circle);
      });
      return;
    }

    if (cfg.features.bubbles) {
      const maxTotal = Math.max(...state.data.rollup.map((r) => r.total), 1);
      state.bubbleLayers = [];
      state.data.rollup.forEach((r) => {
        if (r.lat == null || r.lon == null) return;
        const circle = L.circleMarker([r.lat, r.lon], {
          radius: radiusFor(r.total, maxTotal),
          color: "#183E43",
          weight: 1,
          fillColor: "#C79A3E",
          fillOpacity: 0.65,
        }).addTo(state.map);
        circle.bindPopup(`<strong>${geoDisplayName(geoName(r))}</strong><br />${fmtNumber(r.total)} active licensed shops`);
        state.bubbleLayers.push(circle);
      });
    }
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function flyToGeo(name) {
    if (!state.map) return;
    const centroid = state.geoCentroids[name];
    if (centroid) {
      state.map.flyTo([centroid.lat, centroid.lon], cfg.features.bubbles ? 9 : 12, { duration: 0.8 });
    }
  }

  function initNavObserver() {
    if (!els.dashNav) return;
    const links = [...els.dashNav.querySelectorAll(".dash-nav-link:not(.feature-hidden)")];
    const sections = links
      .map((link) => document.querySelector(link.getAttribute("href")))
      .filter(Boolean);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((link) => {
            link.classList.toggle("is-active", link.getAttribute("href") === `#${entry.target.id}`);
          });
        });
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: 0 }
    );

    sections.forEach((section) => observer.observe(section));
  }

  function renderAll() {
    renderOverview();
    renderRankChart();
    renderGrowth();
    renderPractitioners();
    renderTable();
    renderDataNotes();
  }

  function selectFromSearch() {
    const q = els.search.value.trim();
    const match = q ? findRollup(q) : null;
    state.selectedGeo = match ? geoName(match) : null;
    els.finderHint.textContent = state.selectedGeo
      ? cfg.finder.selectedHint(state.selectedGeo)
      : cfg.finder.emptyHint;
    renderAll();
    if (match) flyToGeo(geoName(match));
  }

  function showUnclassifiedBanner(data) {
    if (!els.unclassifiedBanner || cfg.id === "ny" || cfg.features.aggregate) return;
    const unknownTypes = Object.keys(data.unclassified_license_types || {});
    if (!unknownTypes.length) return;

    els.unclassifiedBanner.hidden = false;
    const totalUnknown = Object.values(data.unclassified_license_types).reduce((a, b) => a + b, 0);
    const label =
      cfg.id === "tx"
        ? "records had a license type this app didn't recognize"
        : "records had a license description this app didn't recognize";
    els.unclassifiedText.textContent =
      `${totalUnknown.toLocaleString()} ${label} ` +
      `(${unknownTypes.slice(0, 5).join(", ")}${unknownTypes.length > 5 ? ", …" : ""}) — ` +
      (cfg.id === "tx"
        ? "they're counted under Unclassified rather than dropped."
        : "they are still counted in totals.");
  }

  function showGeocodeInfo(data) {
    if (!els.geocodeLabel || cfg.id !== "tx") return;
    const gc = data.geocode_coverage || {};
    if (!gc.total) {
      els.geocodeLabel.textContent = "—";
      return;
    }
    els.geocodeLabel.textContent = `${fmtNumber(gc.geocoded)} of ${fmtNumber(gc.total)} shops mapped (${Math.round((gc.geocoded / gc.total) * 100)}%)`;
  }

  function init(data) {
    state.data = data;
    applyStateChrome();

    if (data.is_sample && els.sampleBanner) {
      els.sampleBanner.hidden = false;
    }

    showUnclassifiedBanner(data);
    showGeocodeInfo(data);

    if (data.geocoding_in_progress && els.inProgressBanner) {
      els.inProgressBanner.hidden = false;
    }

    els.sourceLabel.textContent = data.source;
    els.updatedLabel.textContent = new Date(data.generated_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    els.geoList.innerHTML = data.rollup.map((r) => `<option value="${geoName(r)}"></option>`).join("");

    if (cfg.features.practitioners) {
      buildPractitionerCityMap();
    }

    state.geoCentroids =
      cfg.features.shopPins && state.data.shops
        ? computeGeoCentroidsFromShops()
        : computeGeoCentroidsFromRollup();

    els.search.addEventListener("input", selectFromSearch);

    els.tableBody.addEventListener("click", (e) => {
      const row = e.target.closest("tr[data-geo]");
      if (!row) return;
      if (cfg.features.aggregate && row.dataset.stateId) {
        window.location.href = `?state=${row.dataset.stateId}`;
        return;
      }
      els.search.value = row.dataset.geo;
      selectFromSearch();
    });

    if (els.practitionerTypeSelect) {
      els.practitionerTypeSelect.addEventListener("change", () => {
        state.selectedPractitionerType = els.practitionerTypeSelect.value;
        renderPractitionerGrowthChart();
      });
    }

    initNavObserver();
    buildMap();
    renderAll();
  }

  function boot(data) {
    init(data);
  }

  if (cfg.features.aggregate) {
    window
      .loadAggregateData(window.STATES)
      .then(boot)
      .catch((err) => {
        if (els.overviewPanel) {
          els.overviewPanel.innerHTML = `<p class="muted">Couldn't load combined state data (${err.message}). Serve the folder with a local server (e.g. <code>python3 -m http.server</code>) rather than opening the file directly.</p>`;
        }
      });
  } else {
    fetch(cfg.dataUrl)
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(boot)
      .catch((err) => {
        if (els.overviewPanel) {
          els.overviewPanel.innerHTML = `<p class="muted">Couldn't load ${cfg.dataUrl} (${err.message}). Serve the folder with a local server (e.g. <code>python3 -m http.server</code>) rather than opening the file directly.</p>`;
        }
      });
  }
})();
