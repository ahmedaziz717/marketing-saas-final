import { BarChart3, Send, Sparkles, WandSparkles } from "lucide-react";

export const workspaceStudios = {
  create: {
    name: "Creative Studio",
    stage: "Create",
    href: "/app/creatives/studio",
    icon: Sparkles,
    description:
      "Create images and videos with your brand, products, and creative direction.",
    planned: false,
  },
  activate: {
    name: "Activation Studio",
    stage: "Activate",
    href: "/app/activate/studio",
    icon: Send,
    description:
      "Bring copy and assets together, then review and activate your posts and ads.",
    planned: false,
  },
  measure: {
    name: "Insights Studio",
    stage: "Measure",
    href: "/app/analytics/studio",
    icon: BarChart3,
    description:
      "Build reports, schedule delivery, and choose what matters for your dashboards.",
    planned: false,
  },
  optimize: {
    name: "Optimization Studio",
    stage: "Optimize",
    href: "/app/optimize/studio",
    icon: WandSparkles,
    description:
      "Analyze performance, review recommendations, and plan your next controlled experiments.",
    planned: false,
  },
};
