(function (global) {
  "use strict";

  const METRIC_LABEL = {
    establishments: "Shops",
    employees: "Employees",
    payroll_annual_thousands: "Payroll",
    "nonemployer.establishments": "Solo shops",
    "nonemployer.receipts_thousands": "Solo receipts",
    total_shops: "Total shops",
  };

  const LICENSE_STATE_LINKS = {
    "New York": "ny",
    Illinois: "il",
    Texas: "tx",
  };

  function getMetric(cat, metric) {
    if (!cat) return null;
    if (metric === "total_shops") {
      const emp = cat.establishments;
      const solo = cat.nonemployer ? cat.nonemployer.establishments : null;
      if ((emp === null || emp === undefined) && (solo === null || solo === undefined)) return null;
      return (emp || 0) + (solo || 0);
    }
    if (metric.startsWith("nonemployer.")) {
      const field = metric.split(".")[1];
      return cat.nonemployer ? (cat.nonemployer[field] ?? null) : null;
    }
    return cat[metric] ?? null;
  }

  global.bootCensus = function bootCensus({ els, cfg, data }) {
    const censusState = {
      data,
      metric: "establishments",
      selectedFips: null,
    };

    function fmtNumber(n) {
      if (n === null || n === undefined) return null;
      return n.toLocaleString("en-US");
    }

    function fmtPayroll(thousands) {
      if (thousands === null || thousands === undefined) return null;
      const dollars = thousands * 1000;
      if (dollars >= 1_000_000_000) return "$" + (dollars / 1_000_000_000).toFixed(2) + "B";
      if (dollars >= 1_000_000) return "$" + (dollars / 1_000_000).toFixed(1) + "M";
      return "$" + fmtNumber(dollars);
    }

    function formatMetric(metric, value) {
      if (value === null || value === undefined) return null;
      return metric.endsWith("_thousands") ? fmtPayroll(value) : fmtNumber(value);
    }

    function categoryTotal(stateObj, metric) {
      let total = 0;
      let any = false;
      Object.values(stateObj.categories).forEach((cat) => {
        const v = getMetric(cat, metric);
        if (v !== null && v !== undefined) {
          total += v;
          any = true;
        }
      });
      return any ? total : null;
    }

    function findState(query) {
      if (!query) return null;
      const q = query.trim().toLowerCase();
      if (!q) return null;
      return (
        censusState.data.states.find((s) => s.state.toLowerCase() === q) ||
        censusState.data.states.find((s) => s.abbr.toLowerCase() === q) ||
        censusState.data.states.find((s) => s.state.toLowerCase().startsWith(q)) ||
        null
      );
    }

    function nationalTotals() {
      const totals = {};
      Object.keys(censusState.data.categories).forEach((code) => {
        totals[code] = {
          establishments: 0,
          employees: 0,
          payroll_annual_thousands: 0,
          label: censusState.data.categories[code],
        };
      });
      censusState.data.states.forEach((s) => {
        Object.entries(s.categories).forEach(([code, cat]) => {
          ["establishments", "employees", "payroll_annual_thousands"].forEach((m) => {
            if (cat[m] !== null && cat[m] !== undefined) totals[code][m] += cat[m];
          });
          if (cat.nonemployer) {
            if (!totals[code].nonemployer) totals[code].nonemployer = { establishments: 0, receipts_thousands: 0 };
            ["establishments", "receipts_thousands"].forEach((m) => {
              if (cat.nonemployer[m] !== null && cat.nonemployer[m] !== undefined) {
                totals[code].nonemployer[m] += cat.nonemployer[m];
              }
            });
          }
        });
      });
      return totals;
    }

    function applyChrome() {
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

      if (els.directoryKicker) els.directoryKicker.textContent = cfg.directory.kicker;
      if (els.directoryTitle) els.directoryTitle.textContent = cfg.directory.title;
      if (els.directorySub) els.directorySub.textContent = cfg.directory.sub;

      if (els.rankSub) els.rankSub.textContent = cfg.rank.sub;

      const estKicker = document.getElementById("establishments-kicker");
      if (estKicker) estKicker.textContent = "Census · Establishments";

      document.querySelectorAll(".feature-census-only").forEach((node) => {
        node.hidden = false;
        node.classList.remove("feature-hidden");
      });
      document.querySelectorAll(".feature-hide-census").forEach((node) => {
        node.hidden = true;
        node.setAttribute("hidden", "");
        node.classList.add("feature-hidden");
      });
      document.querySelectorAll(".feature-practitioners, .feature-growth").forEach((node) => {
        node.hidden = true;
        node.setAttribute("hidden", "");
        node.classList.add("feature-hidden");
      });

      const tableHead = document.querySelector("#data-table thead tr");
      if (tableHead) {
        tableHead.innerHTML = `
          <th scope="col">State</th>
          <th scope="col">Barbershops<br /><span class="th-sub">est.</span></th>
          <th scope="col">Beauty salons<br /><span class="th-sub">est.</span></th>
          <th scope="col">Nail salons<br /><span class="th-sub">est.</span></th>
          <th scope="col">Total employees</th>
          <th scope="col">Total payroll</th>
          <th scope="col">Solo shops<br /><span class="th-sub">no paid staff</span></th>
          <th scope="col">Total shops<br /><span class="th-sub">employer + solo</span></th>
        `;
      }

      if (els.sampleBannerText) els.sampleBannerText.textContent = cfg.sampleBanner;
    }

    function rankStates(metric) {
      return censusState.data.states
        .map((s) => ({ ...s, _value: categoryTotal(s, metric) }))
        .sort((a, b) => (b._value ?? -1) - (a._value ?? -1));
    }

    function renderOverview() {
      const sel = censusState.selectedFips
        ? censusState.data.states.find((s) => s.state_fips === censusState.selectedFips)
        : null;
      const title = sel ? sel.state : "United States (all states)";
      let rankBadge = "";
      if (sel) {
        const rank = rankStates(censusState.metric).findIndex((r) => r.state_fips === sel.state_fips) + 1;
        rankBadge = `<span class="rank-badge">#${rank} of ${censusState.data.states.length} in ${METRIC_LABEL[censusState.metric].toLowerCase()}</span>`;
      }

      const categories = sel ? sel.categories : nationalTotals();
      const stateTotalShops = Object.values(categories).reduce((sum, cat) => {
        const v = getMetric(cat, "total_shops");
        return v === null ? sum : sum + v;
      }, 0);

      const licenseLink = sel && LICENSE_STATE_LINKS[sel.state]
        ? `<p class="overview-note"><a href="?state=${LICENSE_STATE_LINKS[sel.state]}">View ${sel.state} license registry dashboard →</a></p>`
        : "";

      const boards = Object.entries(categories)
        .map(([, cat]) => {
          const employerRows = [
            ["Establishments", formatMetric("establishments", cat.establishments)],
            ["Employees", formatMetric("employees", cat.employees)],
            ["Annual payroll", formatMetric("payroll_annual_thousands", cat.payroll_annual_thousands)],
          ];
          const nonemp = cat.nonemployer || {};
          const nonempRows = [
            ["Solo/self-employed shops", formatMetric("nonemployer.establishments", nonemp.establishments)],
            ["Annual receipts", formatMetric("nonemployer.receipts_thousands", nonemp.receipts_thousands)],
          ];
          const totalShops = getMetric(cat, "total_shops");
          const rowHtml = ([label, value]) =>
            `<div class="row"><dt>${label}</dt><dd>${value === null ? '<span class="na">withheld</span>' : value}</dd></div>`;
          return `<div class="board">
            <h3>${cat.label}</h3>
            <p class="board-group-label">Employer shops (paid staff)</p>
            <dl>${employerRows.map(rowHtml).join("")}</dl>
            <p class="board-group-label">No paid employees</p>
            <dl>${nonempRows.map(rowHtml).join("")}</dl>
            <div class="row row-total"><dt>Total shops</dt><dd>${totalShops === null ? '<span class="na">withheld</span>' : fmtNumber(totalShops)}</dd></div>
          </div>`;
        })
        .join("");

      els.overviewPanel.innerHTML = `
        <div class="overview-heading">
          <h2>${title}</h2>
          ${rankBadge}
        </div>
        <p class="census-total-shops">
          <span class="census-total-shops-value">${fmtNumber(stateTotalShops)}</span>
          total shops (employer + solo/self-employed) across barbershops, beauty salons & nail salons
        </p>
        <div class="board-grid">${boards}</div>
        ${licenseLink}
      `;
    }

    function renderRankChart() {
      els.rankTitle.textContent = `How states compare — ${METRIC_LABEL[censusState.metric]}`;
      els.rankSub.textContent = `Ranked by total ${METRIC_LABEL[censusState.metric].toLowerCase()} across barbershops, beauty salons & nail salons.`;

      const ranked = rankStates(censusState.metric);
      const max = ranked[0]?._value || 1;
      const showCount = 15;
      let list = ranked.slice(0, showCount);

      if (censusState.selectedFips && !list.find((s) => s.state_fips === censusState.selectedFips)) {
        const selected = ranked.find((s) => s.state_fips === censusState.selectedFips);
        if (selected) list = list.concat([selected]);
      }

      els.rankChart.innerHTML = list
        .map((s) => {
          const pct = s._value ? Math.max(2, (s._value / max) * 100) : 0;
          const isCurrent = s.state_fips === censusState.selectedFips;
          const valueLabel = formatMetric(censusState.metric, s._value) ?? "—";
          return `
            <div class="rank-row${isCurrent ? " is-current" : ""}">
              <div class="rank-name">${s.state}</div>
              <div class="rank-bar-track"><div class="rank-bar-fill" style="width:${pct}%"></div></div>
              <div class="rank-value">${valueLabel}</div>
            </div>`;
        })
        .join("");

      if (ranked.length > showCount) {
        const rankMore = document.createElement("p");
        rankMore.className = "rank-more";
        rankMore.textContent = `Showing top ${showCount} of ${ranked.length}${censusState.selectedFips ? " (plus your selected state)" : ""}. Full list in the directory below.`;
        els.rankChart.appendChild(rankMore);
      }
    }

    function renderTable() {
      const query = els.search.value.trim().toLowerCase();
      const rows = censusState.data.states
        .filter((s) => !query || s.state.toLowerCase().includes(query) || s.abbr.toLowerCase() === query)
        .map((s) => {
          const c = s.categories;
          const get = (code, field) => (c[code] ? c[code][field] : null);
          const totalEmp = categoryTotal(s, "employees");
          const totalPay = categoryTotal(s, "payroll_annual_thousands");
          const totalSolo = categoryTotal(s, "nonemployer.establishments");
          const totalShops = categoryTotal(s, "total_shops");
          const cell = (v) => (v === null || v === undefined ? '<span class="na">—</span>' : fmtNumber(v));
          const isCurrent = s.state_fips === censusState.selectedFips;
          return `
            <tr class="${isCurrent ? "is-current-row" : ""}" data-fips="${s.state_fips}">
              <td>${s.state}</td>
              <td>${cell(get("812111", "establishments"))}</td>
              <td>${cell(get("812112", "establishments"))}</td>
              <td>${cell(get("812113", "establishments"))}</td>
              <td>${cell(totalEmp)}</td>
              <td>${totalPay === null ? '<span class="na">—</span>' : fmtPayroll(totalPay)}</td>
              <td>${cell(totalSolo)}</td>
              <td class="td-total">${cell(totalShops)}</td>
            </tr>`;
        })
        .join("");

      els.tableBody.innerHTML = rows || `<tr><td colspan="8">No states match "${els.search.value}".</td></tr>`;
    }

    function renderDataNotes() {
      if (!els.dataNotesBody) return;
      const notes = [
        {
          title: "What this dataset is",
          body: "County Business Patterns (CBP) employer statistics plus Nonemployer Statistics for solo operators. These are economic census estimates, not state licensing registries.",
        },
        {
          title: "NAICS categories",
          body: "812111 Barber Shops, 812112 Beauty Salons, and 812113 Nail Salons. Some state-industry cells may be withheld by the Census Bureau to protect confidentiality.",
        },
        {
          title: "Compared to license tabs",
          body: "New York, Illinois, and Texas tabs show active business licenses from state open data. Census figures measure establishments differently and cover all states.",
        },
        {
          title: "Metric toggle",
          body: "Use the metric buttons above to re-rank states by shops, employees, payroll, solo shops, or total shops (employer + solo).",
        },
      ];
      els.dataNotesBody.innerHTML = notes
        .map((note) => `<div class="data-note"><h3>${note.title}</h3><p>${note.body}</p></div>`)
        .join("");
    }

    function renderAll() {
      renderOverview();
      renderRankChart();
      renderTable();
      renderDataNotes();
    }

    function selectFromSearch() {
      const match = findState(els.search.value);
      censusState.selectedFips = match ? match.state_fips : null;
      els.finderHint.textContent = match
        ? cfg.finder.selectedHint(match.state)
        : cfg.finder.emptyHint;
      renderAll();
    }

    function initNavObserver() {
      if (!els.dashNav) return;
      const links = [...els.dashNav.querySelectorAll(".dash-nav-link:not(.feature-hidden)")];
      const sections = links.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
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

    applyChrome();

    if (data.is_sample && els.sampleBanner) els.sampleBanner.hidden = false;

    els.sourceLabel.textContent = data.source;
    els.updatedLabel.textContent =
      new Date(data.generated_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }) + ` (CBP ${data.year})`;

    els.geoList.innerHTML = data.states.map((s) => `<option value="${s.state}"></option>`).join("");

    els.search.addEventListener("input", selectFromSearch);

    document.querySelectorAll(".metric-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".metric-btn").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        censusState.metric = btn.dataset.metric;
        renderAll();
      });
    });

    els.tableBody.addEventListener("click", (e) => {
      const row = e.target.closest("tr[data-fips]");
      if (!row) return;
      const match = censusState.data.states.find((s) => s.state_fips === row.dataset.fips);
      if (match) {
        els.search.value = match.state;
        censusState.selectedFips = match.state_fips;
        els.finderHint.textContent = cfg.finder.selectedHint(match.state);
        renderAll();
      }
    });

    initNavObserver();
    renderAll();
  };
})(typeof window !== "undefined" ? window : globalThis);
