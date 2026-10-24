import { newWorkflowNode, type WorkflowGraph } from "./creativeWorkflow";
import { appFieldSchema, type AppField } from "./workflowInputs";
import { copyDimensions, copyTaxonomy } from "./copyTaxonomy";

/** The published App inherits this entire field contract, including content controls. */
export function productSocialWorkflow(): WorkflowGraph {
  const field = (
    id: string,
    title: string,
    config: Partial<AppField>,
    y: number
  ) => {
    const node = newWorkflowNode("app_input", id, 60, y);
    node.title = title;
    node.config.field = appFieldSchema.parse(config);
    return node;
  };
  const asset = field(
    "asset",
    "Product image or approved asset",
    {
      kind: "asset",
      required: true,
      help: "Choose an image, then select the product facts to include. Product images become finished assets for review before a post is prepared.",
      media: {
        productImages: true,
        approvedAssets: true,
        finishedAssetsOnly: true,
        allowUpload: true,
        bullets: "choose",
        price: "choose",
        description: "choose",
        link: "choose",
      },
      studio: { section: "setup", category: "Product & assets" },
    },
    60
  );
  const destination = field(
    "destination",
    "Facebook Page",
    {
      kind: "connection",
      connectionChannel: "facebook",
      required: true,
      studio: { section: "setup", category: "Destination" },
    },
    320
  );
  const audience = field(
    "audience",
    "Who is this post for?",
    {
      kind: "audience",
      required: true,
      help: "Describe the intended audience and what matters to them.",
      studio: { section: "direction", category: "Audience" },
    },
    580
  );
  const directions = copyDimensions.map((dimension, i) =>
    field(
      dimension,
      copyTaxonomy[dimension].label,
      {
        kind: "choice",
        source: "curated",
        multiple: true,
        maxSelections: 3,
        options: copyTaxonomy[dimension].values.map(v => ({
          id: v.id,
          label: v.label,
          direction: v.description,
        })),
        studio: {
          section: "direction",
          category: copyTaxonomy[dimension].label,
        },
      },
      840 + i * 160
    )
  );
  const brief = field(
    "brief",
    "What should this post achieve?",
    {
      kind: "text",
      required: true,
      help: "Add your message, goal and any instructions. Copy is generated once from all your choices.",
      studio: { section: "content", category: "Brief" },
    },
    2200
  );
  const copy = newWorkflowNode("assistant", "copy", 480, 140);
  copy.title = "Generate post copy";
  copy.config.text =
    "Write one finished Facebook post caption from the audience, brief, chosen directions and verified product facts. Return only the caption, at most 4000 characters. Use only supplied facts. Include only selected feature bullets; omit prices, descriptions and links unless the selected product context explicitly permits them. Never infer prices, promotions, specifications, claims or URLs from the image or brand. Do not repeat field labels or instructions. Keep the caption editable for final review.";
  const post = newWorkflowNode("facebook_post", "post", 900, 140);
  post.title = "Product social post";
  const result = newWorkflowNode("output", "result", 1320, 140);
  result.title = "Caption, image & post draft";
  const edge = (source: string, target: string, port: string) => ({
    id: `${source}-${target}-${port}`,
    source,
    target,
    port,
  });
  return {
    nodes: [
      asset,
      destination,
      audience,
      ...directions,
      brief,
      copy,
      post,
      result,
    ],
    edges: [
      edge("asset", "copy", "image"),
      edge("audience", "copy", "text"),
      ...directions.map(n => edge(n.id, "copy", "text")),
      edge("brief", "copy", "text"),
      edge("copy", "post", "text"),
      edge("asset", "post", "image"),
      edge("destination", "post", "destination"),
      edge("copy", "result", "result"),
      edge("asset", "result", "result"),
      edge("post", "result", "result"),
    ],
  };
}
