import { BarChart3, Send, Images, Infinity } from "lucide-react";

export const workspaceStudios = {
  create: {
    name: "Creative Studio",
    stage: "Create",
    href: "/app/creatives/studio",
    icon: Images,
    description: "Turn ideas into images and videos.",
    planned: false,
  },
  activate: {
    name: "Activation Studio",
    stage: "Activate",
    href: "/app/activate/studio",
    icon: Send,
    description: "Review and launch across channels.",
    planned: false,
  },
  measure: {
    name: "Insights Studio",
    stage: "Measure",
    href: "/app/analytics/studio",
    icon: BarChart3,
    description: "See what’s working. Share the insight.",
    planned: false,
  },
  optimize: {
    name: "Optimization Studio",
    stage: "Optimize",
    href: "/app/optimize/studio",
    icon: Infinity,
    description: "Find your next improvement.",
    planned: false,
  },
};
