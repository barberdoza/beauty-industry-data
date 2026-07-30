(function () {
  "use strict";

  const state = {
    data: null,
    selectedCity: null,
    selectedPractitionerType: "cosmetologist",
    cityCentroids: null,
    practitionerByCity: null,
    map: null,
    clusterLayer: null,
  };

  const els = {
    search: document.getElementById("city-search"),
    cityList: document.getElementById("city-list"),
    finderHint: document.getElementById("finder-hint"),
    overviewPanel: document.getElementById("overview-panel"),
    rankTitle: document.getElementById("rank-title"),
    rankSub: document.getElementById("rank-sub"),
    rankChart: document.getElementById("rank-chart"),
    growthTitle: document.getElementById("growth-title"),
    growthSub: document.getElementById("growth-sub"),
    growthChart: document.getElementById("growth-chart"),
    practitionerSub: document.getElementById("practitioner-sub"),
    practitionerTableBody: document.getElementById("practitioner-table-body"),
    practitionerLatestYearCol: document.getElementById("practitioner-latest-year-col"),
    practitionerTypeSelect: document.getElementById("practitioner-type-select"),
    practitionerGrowthChart: document.getElementById("practitioner-growth-chart"),
    practitionerGrowthMeta: document.getElementById("practitioner-growth-meta"),
    practitionerCityChart: document.getElementById("practitioner-city-chart"),
    tableBody: document.getElementById("data-table-body"),
    dataNotesBody: document.getElementById("data-notes-body"),
    dashNav: document.getElementById("dash-nav"),
    sampleBanner: document.getElementById("sample-banner"),
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

  function findRollup(cityName) {
    const q = cityName.trim().toLowerCase();
    if (!q) return null;
    return (
      state.data.rollup.find((r) => r.city.toLowerCase() === q) ||
      state.data.rollup.find((r) => r.city.toLowerCase().startsWith(q)) ||
      null
    );
  }

  function statewideTotals() {
    const totals = { total: 0 };
    Object.keys(state.data.categories).forEach((code) => (totals[code] = 0));
    state.data.rollup.forEach((r) => {
      totals.total += r.total;
      Object.keys(state.data.categories).forEach((code) => {
        totals[code] += r[code] || 0;
      });
    });
    return totals;
  }

  function growthSeries() {
    if (!state.data.growth) return [];
    if (state.selectedCity && state.data.growth_by_city && state.data.growth_by_city[state.selectedCity]) {
      return state.data.growth_by_city[state.selectedCity];
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

  function renderOverview() {
    const sel = state.selectedCity ? findRollup(state.selectedCity) : null;
    const title = sel ? sel.city : "New York State";
    const shopTotals = sel || statewideTotals();
    const practitionerTotal = practitionerTotalForCity(state.selectedCity);
    const practitionerScope = state.selectedCity ? "Estimated for this city" : "Statewide active total";
    const cityPrac = state.selectedCity && state.practitionerByCity?.[state.selectedCity];
    const barberDisplay = cityPrac ? (cityPrac.barber || 0) + (cityPrac.barber_apprentice || 0) : (state.data.practitioner_totals?.barber || 0);
    const cosmDisplay = cityPrac ? cityPrac.cosmetologist || 0 : (state.data.practitioner_totals?.cosmetologist || 0);
    const esthDisplay = cityPrac ? cityPrac.esthetician || 0 : (state.data.practitioner_totals?.esthetician || 0);

    let rankBadge = "";
    if (sel) {
      const sorted = [...state.data.rollup].sort((a, b) => b.total - a.total);
      const rank = sorted.findIndex((r) => r.city === sel.city) + 1;
      rankBadge = `<span class="rank-badge">#${rank} of ${sorted.length} cities by shops</span>`;
    }

    const est = latestEstablishmentYearStats();
    const prac = latestPractitionerYearStats();
    const estYoY = est.latest && est.prior ? yoyChange(est.latest.total, est.prior.total) : null;
    const pracYoY = prac.latest && prac.prior ? yoyChange(prac.latest.total, prac.prior.total) : null;
    const estYoYClass = estYoY == null ? "" : estYoY >= 0 ? " is-up" : " is-down";
    const pracYoYClass = pracYoY == null ? "" : pracYoY >= 0 ? " is-up" : " is-down";

    els.overviewPanel.innerHTML = `
      <div class="overview-heading">
        <h2>${title}</h2>
        ${rankBadge}
      </div>
      <div class="overview-grid">
        <article class="overview-card overview-card-verified">
          <span class="overview-tag">Verified · Establishments</span>
          <p class="overview-stat-value">${fmtNumber(shopTotals.total)}</p>
          <p class="overview-stat-label">Active licensed shops</p>
          <dl class="overview-breakdown">
            <div><dt>Barbershops</dt><dd>${fmtNumber(shopTotals.DOSBARSHOPOWNER || 0)}</dd></div>
            <div><dt>Appearance businesses</dt><dd>${fmtNumber(shopTotals.DOSAEBUSINESS || 0)}</dd></div>
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
      </div>
    `;
  }

  function renderGrowth() {
    const series = growthSeries();
    if (!series.length) {
      els.growthChart.innerHTML = `<p class="muted">Growth data is not available yet.</p>`;
      return;
    }

    const baselineYear = state.data.growth_baseline_year || 2014;
    const chartYears = series.filter((row) => row.year > baselineYear);
    const max = Math.max(...chartYears.map((row) => row.total), 1);
    const categoryCodes = Object.keys(state.data.categories);

    els.growthTitle.textContent = state.selectedCity
      ? `New establishment licenses in ${state.selectedCity}`
      : "New establishment licenses by year";
    els.growthSub.textContent = state.selectedCity
      ? "Original license issue year for active shops in this city."
      : "Original license issue year for currently active shop locations statewide.";

    els.growthChart.innerHTML = chartYears
      .map((row, index) => {
        const prev = chartYears[index - 1];
        const change = prev ? yoyChange(row.total, prev.total) : null;
        const changeClass = change == null ? "" : change >= 0 ? " is-up" : " is-down";
        const partialClass = isPartialYear(row.year) ? " is-partial" : "";
        const segments = categoryCodes
          .map((code) => {
            const value = row[code] || 0;
            const width = row.total ? (value / row.total) * (row.total / max) * 100 : 0;
            const tone = code === "DOSBARSHOPOWNER" ? "barber" : "aeb";
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
        <span><i class="growth-swatch growth-swatch-barber"></i>${categoryLabel("DOSBARSHOPOWNER")}</span>
        <span><i class="growth-swatch growth-swatch-aeb"></i>${categoryLabel("DOSAEBUSINESS")}</span>
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
      .map((key) => `<option value="${key}"${key === state.selectedPractitionerType ? " selected" : ""}>${practitionerLabel(key)}</option>`)
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

    if (state.selectedCity) {
      const sel = ranked.find((row) => row.city === state.selectedCity);
      if (sel && !list.find((row) => row.city === sel.city)) list = list.concat([sel]);
    }

    els.practitionerCityChart.innerHTML = list
      .map((row) => {
        const isCurrent = state.selectedCity && row.city.toLowerCase() === state.selectedCity.trim().toLowerCase();
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

    if (state.selectedCity) {
      const sel = findRollup(state.selectedCity);
      if (sel && !list.find((r) => r.city === sel.city)) list = list.concat([sel]);
    }

    els.rankTitle.textContent = state.selectedCity
      ? `Top cities · ${state.selectedCity} highlighted`
      : "Top cities by total shops";

    els.rankChart.innerHTML = list
      .map((r) => {
        const pct = Math.max(2, (r.total / max) * 100);
        const isCurrent = state.selectedCity && r.city.toLowerCase() === state.selectedCity.trim().toLowerCase();
        return `
          <div class="rank-row${isCurrent ? " is-current" : ""}">
            <div class="rank-name">${r.city}</div>
            <div class="rank-bar-track"><div class="rank-bar-fill" style="width:${pct}%"></div></div>
            <div class="rank-value">${fmtNumber(r.total)}</div>
          </div>`;
      })
      .join("");

    if (ranked.length > showCount) {
      const more = document.createElement("p");
      more.className = "rank-more";
      more.textContent = `Showing top ${showCount} of ${ranked.length} cities. Full list in the directory below.`;
      els.rankChart.appendChild(more);
    }
  }

  function renderTable() {
    const query = els.search.value.trim().toLowerCase();
    const rows = state.data.rollup
      .filter((r) => !query || r.city.toLowerCase().includes(query))
      .map((r) => {
        const isCurrent = state.selectedCity && r.city.toLowerCase() === state.selectedCity.trim().toLowerCase();
        const estPractitioners = state.practitionerByCity?.[r.city]?.total;
        return `
          <tr class="${isCurrent ? "is-current-row" : ""}" data-city="${r.city}">
            <td>${r.city}</td>
            <td>${fmtNumber(r.DOSBARSHOPOWNER || 0)}</td>
            <td>${fmtNumber(r.DOSAEBUSINESS || 0)}</td>
            <td class="td-total">${fmtNumber(r.total)}</td>
            <td class="td-est">${fmtNumber(estPractitioners)}</td>
          </tr>`;
      })
      .join("");

    els.tableBody.innerHTML = rows || `<tr><td colspan="5">No cities match "${els.search.value}".</td></tr>`;
  }

  function renderDataNotes() {
    if (!els.dataNotesBody) return;
    const notes = [
      { title: "Establishment counts", body: state.data.growth_note },
      { title: "Establishment growth", body: "New shop counts use original license issue dates among currently active locations. Area renters are excluded from shop totals to avoid double-counting addresses." },
      { title: "Practitioner totals", body: "Individual license counts come from a separate NY open data registry. Practitioner home or work cities are not published." },
      { title: "Practitioner growth", body: state.data.practitioner_growth_note },
      { title: "City practitioner estimates", body: state.data.practitioner_city_note },
      { title: "Verified area renters", body: state.data.renter_note },
    ].filter((note) => note.body);

    els.dataNotesBody.innerHTML = notes
      .map((note) => `<div class="data-note"><h3>${note.title}</h3><p>${note.body}</p></div>`)
      .join("");
  }

  function computeCityCentroids() {
    const sums = {};
    state.data.shops.forEach(([, , , city, , lat, lon]) => {
      if (lat == null || lon == null) return;
      const b = sums[city] || (sums[city] = { lat: 0, lon: 0, n: 0 });
      b.lat += lat;
      b.lon += lon;
      b.n += 1;
    });
    const out = {};
    Object.entries(sums).forEach(([city, b]) => {
      out[city] = { lat: b.lat / b.n, lon: b.lon / b.n };
    });
    return out;
  }

  function buildMap() {
    state.map = L.map("map", { scrollWheelZoom: true }).setView([42.9, -75.5], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(state.map);

    state.clusterLayer = L.markerClusterGroup({ maxClusterRadius: 50 });

    state.data.shops.forEach(([name, category, address, city, zip, lat, lon]) => {
      if (lat == null || lon == null) return;
      const marker = L.marker([lat, lon]);
      marker.bindPopup(
        `<div class="shop-popup"><strong>${escapeHtml(name)}</strong><br />
         <span class="shop-popup-cat">${escapeHtml(categoryLabel(category))}</span><br />
         ${escapeHtml(address)}, ${escapeHtml(city)} ${escapeHtml(zip)}</div>`
      );
      state.clusterLayer.addLayer(marker);
    });

    state.map.addLayer(state.clusterLayer);
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function flyToCity(cityName) {
    if (!state.map) return;
    const centroid = state.cityCentroids[cityName];
    if (centroid) {
      state.map.flyTo([centroid.lat, centroid.lon], 12, { duration: 0.8 });
    }
  }

  function initNavObserver() {
    if (!els.dashNav) return;
    const links = [...els.dashNav.querySelectorAll(".dash-nav-link")];
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
    state.selectedCity = match ? match.city : null;
    els.finderHint.textContent = state.selectedCity
      ? `Showing ${state.selectedCity}. Clear the search to return to statewide view.`
      : "Showing statewide totals until you pick a city.";
    renderAll();
    if (match) flyToCity(match.city);
  }

  function init(data) {
    state.data = data;

    if (data.is_sample) {
      els.sampleBanner.hidden = false;
    }
    els.sourceLabel.textContent = data.source;
    els.updatedLabel.textContent = new Date(data.generated_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    els.cityList.innerHTML = data.rollup.map((r) => `<option value="${r.city}"></option>`).join("");
    buildPractitionerCityMap();
    state.cityCentroids = computeCityCentroids();

    els.search.addEventListener("input", selectFromSearch);

    els.tableBody.addEventListener("click", (e) => {
      const row = e.target.closest("tr[data-city]");
      if (!row) return;
      els.search.value = row.dataset.city;
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

  fetch("data/ny_shops.json")
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(init)
    .catch((err) => {
      if (els.overviewPanel) {
        els.overviewPanel.innerHTML = `<p class="muted">Couldn't load data/ny_shops.json (${err.message}). Serve the folder with a local server (e.g. <code>python3 -m http.server</code>) rather than opening the file directly.</p>`;
      }
    });
})();
