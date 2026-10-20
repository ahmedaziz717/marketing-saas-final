import { useState } from "react";
import { InsightWidget } from "../../client/src/components/InsightWidget";
import { DateRangeFilter } from "../../client/src/components/DateRangeFilter";
import { StudioProductFacts } from "../../client/src/components/configurator/StudioProductFacts";
import { CatalogFactsFields } from "../../client/src/components/CatalogFactsFields";
import {
  defaultInsightConfig,
  recommendedWidgetLayout,
} from "../../shared/insights";
import type { ProductFactSelection } from "../../shared/studioProductFacts";

export function ReleaseDetailsFixture({ facts = false }: { facts?: boolean }) {
  const [range, setRange] = useState({
    since: "2026-10-01",
    until: "2026-10-19",
  });
  const [selection, setSelection] = useState<ProductFactSelection>({
    productId: 1,
    featuredSpecKeys: ["Processor"],
    includePrice: false,
    featuredFeatures: ["Tool-free access"],
  });
  const [editable, setEditable] = useState({
    specifications:
      "Processor: Intel Core Ultra\nGraphics: NVIDIA RTX 5090\nMemory: 64 GB DDR5",
    features: ["Tool-free access", "Liquid cooling"],
    availability: "In stock",
  });
  const config = {
    ...defaultInsightConfig(),
    name: "Weekly account report",
    metrics: ["spend", "revenue", "purchases", "roas"],
    compare: true,
  } as any;
  const account = {
    connectionId: "fixture",
    name: "Example account",
    channel: "meta_ads",
    currency: "USD",
    metrics: [
      { key: "spend", value: 95458.2, previous: 81724.52, change: 16.8 },
      { key: "revenue", value: 1254631.17, previous: 1023631.1, change: 22.6 },
      { key: "purchases", value: 3246, previous: 2932, change: 10.7 },
      { key: "roas", value: 13.14, previous: 12.5, change: 5.1 },
    ],
    series: [],
    details: [],
    detailMetrics: [],
    detailLabel: "Campaigns",
  } as any;
  const run = {
    status: "completed",
    revision: 1,
    finishedAtMs: Date.now(),
    config,
    result: {
      range,
      accounts: [account],
      findings: [
        "Review spend and revenue together before adjusting campaign delivery.",
        "This saved report includes comparison metrics and keeps the account’s currency visible.",
      ],
      warnings: [],
    },
  } as any;
  const noop = () => {};
  return (
    <main className="space-y-6 p-4">
      <h1>
        {facts
          ? "Structured product details"
          : "Report layout and date choices"}
      </h1>
      {facts ? (
        <>
          <StudioProductFacts
            products={[
              {
                id: 1,
                name: "CLX sample desktop",
                specifications: {
                  Processor: "Intel Core Ultra",
                  Graphics: "NVIDIA RTX 5090",
                  Memory: "64 GB DDR5",
                },
                features: editable.features,
                availability: "In stock",
                price: "3799.99",
                currency: "USD",
                description: "Performance desktop for demanding creative work.",
              },
            ]}
            selections={[selection]}
            onChange={setSelection}
            onSources={noop}
          />
          <CatalogFactsFields
            {...editable}
            onChange={patch => setEditable({ ...editable, ...patch })}
          />
        </>
      ) : (
        <>
          <DateRangeFilter value={range} onChange={setRange} />
          <div className="insights-dashboard">
            <div className="insight-dashboard-grid">
              <InsightWidget
                widget={
                  {
                    id: "fixture-report",
                    reportId: "fixture",
                    kind: "report",
                    title: "Weekly account report",
                    metric: "spend",
                    components: ["summary", "metrics"],
                    ...recommendedWidgetLayout(
                      "report",
                      ["summary", "metrics"],
                      4
                    ),
                    palette: "canvas",
                    accent: "violet",
                  } as any
                }
                entry={{ report: { config, revision: 1 }, latest: run } as any}
                loading={false}
                editing={false}
                first
                last
                refreshing={false}
                onEdit={noop}
                onMove={noop}
                onRemove={noop}
                onRefresh={noop}
                onDrag={noop}
                onDrop={noop}
              />
            </div>
          </div>
        </>
      )}
    </main>
  );
}
