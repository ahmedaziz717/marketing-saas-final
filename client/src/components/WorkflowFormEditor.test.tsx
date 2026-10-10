// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { newWorkflowNode, type WorkflowGraph } from "@shared/creativeWorkflow";
vi.mock("@/lib/trpc",()=>({trpc:{catalog:{overview:{useQuery:()=>({data:{products:[]}})}},assetLibrary:{studioList:{useQuery:()=>({data:[]})}},workflows:{assistInput:{useMutation:()=>({mutateAsync:vi.fn(),isPending:false})}}}}));
import {WorkflowFormEditor} from "./WorkflowFormEditor";
afterEach(cleanup);
it("adds a reusable field, connects it, and previews the same default",()=>{
 function Harness(){const [g,setG]=useState<WorkflowGraph>({nodes:[newWorkflowNode("assistant","writer")],edges:[]});const [preview,setPreview]=useState(false);return <><button onClick={()=>setPreview(!preview)}>Toggle preview</button><WorkflowFormEditor graph={g} onChange={setG} organizationId={1} preview={preview}/><output data-testid="graph">{JSON.stringify(g)}</output></>;}
 render(<Harness/>);
 fireEvent.click(screen.getByRole("button",{name:"+ Add field"}));
 fireEvent.click(screen.getByLabelText("AI prompt writer"));
 const g=JSON.parse(screen.getByTestId("graph").textContent!);
 expect(g.nodes[1].config.field.kind).toBe("theme");expect(g.edges[0].port).toBe("text");
 const select=screen.getByRole("combobox",{name:"Theme"}) as HTMLSelectElement;
 const value=select.options[1].value;
 fireEvent.change(select,{target:{value}});
 fireEvent.click(screen.getByRole("button",{name:"Toggle preview"}));
 expect((screen.getByRole("combobox",{name:"Theme"}) as HTMLSelectElement).value).toBe(value);
 expect(screen.getByText("This preview does not run the workflow or spend credits.")).toBeTruthy();
});
