export type McpVideoPolicy = {
  version: 1;
  state: "draft" | "bound";
  identity: {
    userId: number;
    organizationId: number;
    connectionId: string;
    resource: string;
  };
  parentRunId: string;
  nodeId: string;
  approvalHash: string;
  setupHash: string;
  contextHash: string;
  credits: number;
  maxCredits: number;
  referencesHash?: string;
  requestHash?: string;
  rateHash?: string;
};
