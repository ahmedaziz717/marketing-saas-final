import {
  Bell,
  Code2,
  CreditCard,
  Database,
  History,
  Plug,
  Shield,
  Users,
} from "lucide-react";

export const settingsSections = [
  { id: "team", label: "Team & access", icon: Users },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "billing", label: "Billing & usage", icon: CreditCard },
  { id: "activity", label: "Activity & audit log", icon: History },
  { id: "prompts", label: "Prompt defaults", icon: Code2 },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "data", label: "Data & privacy", icon: Database },
  { id: "developer", label: "API & AI assistants", icon: Code2 },
] as const;

export function settingsSectionForPath(path: string) {
  const section = path.split("/")[3];
  return (
    settingsSections.find(item => item.id === section) ?? settingsSections[0]
  );
}
