export type LogoPlacement = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type LogoPreservationMetadata = LogoPlacement & {
  method: "original_logo_v1";
  sourceKey: string;
  sha256: string;
  designStorageKey: string;
  designUrl: string;
};
