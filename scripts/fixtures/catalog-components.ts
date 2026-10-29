// Synthetic local fixture. No production images, requests or saves.
export function componentCatalogFixture() {
  const picture = (color: string) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="700" height="700"><rect width="700" height="700" fill="#f0f4f6"/><rect x="220" y="100" width="270" height="500" rx="16" fill="${color}"/><rect x="255" y="145" width="190" height="350" fill="#86c5d8"/><circle cx="350" cy="240" r="55" fill="#e7f8fb"/><circle cx="350" cy="390" r="55" fill="#d6eef6"/></svg>`)}`;
  const media = (groupId: string) => ({
    width: 700,
    height: 700,
    hasAlpha: false,
    candidates: [],
    selectedSourceUrl: "https://fixture.test/original.png",
    references: [{ groupId, imageId: "front", position: 0 }],
    unavailableCandidates: 0,
  });
  const group = (id: string, role: string) => ({
    id,
    name: id === "system" ? "System original" : "Chassis original",
    role,
    eligible: true,
    declaredImages: 1,
    imageIds: ["front"],
  });
  const rows = [
    {
      id: 1,
      name: "Complete system",
      recordType: "standalone",
      description:
        "Complete system with its own original gallery. Components are separate cards.",
      specifications: { CPU: "System CPU", Memory: "32 GB" },
      provenance: { source: "api" },
      mediaGroups: [
        group("system", "system"),
        group("option:black", "optional_component"),
        group("option:print", "optional_component"),
      ],
      representedGroupIds: ["option:black", "option:print"],
      images: [
        {
          id: 1,
          url: picture("#203447"),
          isPrimary: 1,
          media: media("system"),
        },
        { id: 2, url: picture("#172333"), media: media("option:black") },
        { id: 3, url: picture("#75518a"), media: media("option:print") },
      ],
    },
    ...["Black enclosure", "Printed enclosure"].map((name, index) => ({
      id: index + 2,
      name: `Chassis: ${name}`,
      recordType: "accessory",
      description:
        "Chassis component only. Not a complete system. No standalone sale price supplied.",
      specifications: { "Component type": "Chassis" },
      provenance: {
        "component.sourceCode": `case-${index + 1}`,
        "component.kind": "Chassis",
      },
      mediaGroups: [group("component", "system")],
      representedGroupIds: [],
      images: [
        {
          id: index + 4,
          url: picture(index ? "#75518a" : "#172333"),
          isPrimary: 1,
          media: media("component"),
        },
      ],
    })),
  ];
  const links = rows
    .slice(1)
    .map((p, index) => ({
      parentProductId: 1,
      componentProductId: p.id,
      parentName: rows[0].name,
      componentName: p.name,
      kind: "Chassis",
      sourceCode: `case-${index + 1}`,
      optionAmount: index ? "75" : "0",
      amountMeaning: "upgrade_delta",
    }));
  return {
    products: rows.map(p => ({
      ...p,
      organizationId: 1,
      sourceId: 1,
      marketingCategory: {
        status: "unmapped",
        category: null,
        sourceCategory: null,
        sourceId: 1,
        origin: "unmapped",
        revision: 1,
      },
      sku: `fixture-${p.id}`,
      category: "",
      price: null,
      currency: null,
      productUrl: "",
      features: [],
      variants: [],
      variantCount: 0,
      status: "pending",
      createdAtMs: 1,
      updatedAtMs: 1,
      componentLinks: links.filter(
        l => l.parentProductId === p.id || l.componentProductId === p.id
      ),
    })),
    total: 3,
    hasMore: false,
    categories: [],
    latestJob: null,
  };
}
