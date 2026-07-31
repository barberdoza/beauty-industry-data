(function (global) {
  "use strict";

  const SOURCE_DEFS = [
    {
      id: "ny",
      name: "New York",
      geoLabel: "cities",
      mapCenter: [42.9, -75.5],
      sumRow(row) {
        return {
          barber: row.DOSBARSHOPOWNER || 0,
          salon: row.DOSAEBUSINESS || 0,
          total: row.total || 0,
        };
      },
      practitioners(data) {
        if (!data.practitioner_totals) return null;
        return Object.values(data.practitioner_totals).reduce((sum, n) => sum + n, 0);
      },
    },
    {
      id: "il",
      name: "Illinois",
      geoLabel: "counties",
      mapCenter: [40.0, -89.2],
      sumRow(row) {
        return {
          barber: row.BARBER || 0,
          salon: row.SALON_SHOP || 0,
          total: row.total || 0,
        };
      },
    },
    {
      id: "tx",
      name: "Texas",
      geoLabel: "counties",
      mapCenter: [31.0, -99.5],
      sumRow(row) {
        return {
          barber: row.BARBER || 0,
          salon: (row.SALON || 0) + (row.UNSPLIT || 0) + (row.UNKNOWN || 0),
          total: row.total || 0,
        };
      },
      geocoded(data) {
        return data.geocode_coverage || null;
      },
    },
    {
      id: "ca",
      name: "California",
      geoLabel: "cities",
      mapCenter: [37.2, -119.5],
      sumRow(row) {
        return {
          barber: row.BARBER || 0,
          salon: row.ESTABLISHMENT || 0,
          total: row.total || 0,
        };
      },
      practitioners(data) {
        if (!data.practitioner_totals) return null;
        return Object.values(data.practitioner_totals).reduce((sum, n) => sum + n, 0);
      },
    },
  ];

  function sumRollup(data, sumRow) {
    const totals = { total: 0, barber: 0, salon: 0 };
    (data.rollup || []).forEach((row) => {
      const part = sumRow(row);
      totals.total += part.total;
      totals.barber += part.barber;
      totals.salon += part.salon;
    });
    return totals;
  }

  global.buildAggregateData = function buildAggregateData(datasets) {
    const rollup = SOURCE_DEFS.map((def) => {
      const data = datasets[def.id];
      const totals = sumRollup(data, def.sumRow.bind(def));
      return {
        state: def.name,
        stateId: def.id,
        geoCount: (data.rollup || []).length,
        geoLabel: def.geoLabel,
        lat: def.mapCenter[0],
        lon: def.mapCenter[1],
        practitioners: def.practitioners ? def.practitioners(data) : null,
        geocoded: def.geocoded ? def.geocoded(data) : null,
        generated_at: data.generated_at,
        source: data.source,
        ...totals,
      };
    });

    const combined = rollup.reduce(
      (acc, row) => {
        acc.total += row.total;
        acc.barber += row.barber;
        acc.salon += row.salon;
        return acc;
      },
      { total: 0, barber: 0, salon: 0 }
    );

    const generatedAt = rollup
      .map((row) => row.generated_at)
      .filter(Boolean)
      .sort()
      .pop();

    return {
      generated_at: generatedAt,
      source: "Multiple state open data registries (New York, Illinois, Texas, California)",
      is_sample: rollup.some((row) => datasets[row.stateId]?.is_sample),
      categories: {
        barber: "Barber / barbershop",
        salon: "Salon, appearance & full-service",
      },
      rollup,
      combined,
      practitioner_total_ny: rollup.find((row) => row.stateId === "ny")?.practitioners || null,
      aggregate_note:
        "Totals sum active licensed shop locations from each state registry. Categories are normalized across different state license schemas — barbershop-type licenses vs. salon, appearance, and combined establishment types.",
      practitioner_note:
        "Individual practitioner license counts are published for New York and California. They are shown for context but are not included in the combined shop total above.",
      geography_note:
        "New York and California are rolled up by city; Illinois and Texas by county. Local geography counts are not comparable across states.",
    };
  };

  global.loadAggregateData = function loadAggregateData(statesConfig) {
    const ids = ["ny", "il", "tx", "ca"];
    return Promise.all(
      ids.map((id) =>
        fetch(statesConfig[id].dataUrl).then((response) => {
          if (!response.ok) throw new Error(`${statesConfig[id].dataUrl}: HTTP ${response.status}`);
          return response.json();
        })
      )
    ).then(([ny, il, tx, ca]) => buildAggregateData({ ny, il, tx, ca }));
  };
})(typeof window !== "undefined" ? window : globalThis);
