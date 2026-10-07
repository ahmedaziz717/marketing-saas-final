import { useState } from "react";
import { Input } from "./ui/input";
import { trpc } from "@/lib/trpc";
import { builtinWorkflowApps } from "@shared/workflowAppCatalog";
import {
  workflowFamilies,
  workflowNodes,
  type WorkflowNode,
} from "@shared/creativeWorkflow";
import { workflowSections } from "@shared/workflowPlatform";

export function WorkflowAppPicker({
  node,
  organizationId,
  disabled,
  onSelect,
}: {
  node: WorkflowNode;
  organizationId: number;
  disabled: boolean;
  onSelect: (selection: string) => void;
}) {
  const [search, setSearch] = useState("");
  const apps = trpc.workflows.listApps.useQuery({ organizationId });
  const connections = trpc.channels.connections.useQuery({ organizationId });
  const selected = node.config.builtinAppId
    ? `builtin:${node.config.builtinAppId}`
    : (node.config.appVersionId ?? "");
  const matches = (name: string, id: string) =>
    id === selected || name.toLowerCase().includes(search.trim().toLowerCase());
  const chosen = builtinWorkflowApps.find(a => `builtin:${a.id}` === selected);
  const channel = chosen?.nodeType
    ? workflowNodes[chosen.nodeType].channel
    : undefined;
  return (
    <>
      <label>
        Find an App
        <Input
          type="search"
          value={search}
          placeholder="Search built-in and workspace Apps…"
          onChange={e => setSearch(e.target.value)}
        />
      </label>
      <label>
        App
        <select
          value={selected}
          disabled={disabled}
          onChange={e => onSelect(e.target.value)}
        >
          <option value="">Choose an App</option>
          {workflowFamilies.map(family => (
            <optgroup
              key={family}
              label={`Built-in · ${workflowSections[family].name}`}
            >
              {builtinWorkflowApps
                .filter(
                  a => a.family === family && matches(a.name, `builtin:${a.id}`)
                )
                .map(app => (
                  <option
                    key={app.id}
                    value={`builtin:${app.id}`}
                    disabled={!app.nodeType}
                  >
                    {app.name}
                    {app.unavailable ? ` — ${app.unavailable}` : ""}
                  </option>
                ))}
            </optgroup>
          ))}
          <optgroup label="Your workspace Apps">
            {apps.data
              ?.filter(app => matches(app.name, app.id))
              .map(app => (
                <option key={app.id} value={app.id}>
                  {workflowSections[app.family].name} · {app.name} · v
                  {app.version}
                </option>
              ))}
          </optgroup>
        </select>
      </label>
      {apps.isLoading && (
        <p className="wf-setting-help">
          Loading workspace Apps… Built-in Apps are available in the picker.
        </p>
      )}
      {apps.error && (
        <p role="alert">Could not load workspace Apps: {apps.error.message}</p>
      )}
      {chosen ? (
        <p className="wf-setting-help">
          Built-in App. Configure its inputs and settings below.{" "}
          {channel &&
          !connections.data?.items.some(
            c => c.status === "connected" && c.channel === channel
          )
            ? `Connect ${channel === "facebook" ? "a Facebook Page" : "Meta Ads"} before running this App.`
            : ""}
        </p>
      ) : (
        <p className="wf-setting-help">
          Built-in Apps and published Apps from all four sections are listed
          here. Workspace Apps keep the selected version.
        </p>
      )}
    </>
  );
}
