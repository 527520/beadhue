import type {
  GenerationParams,
  PaletteSelection,
  ProjectFile,
} from "@beadhue/core/types";
export type WorkerTask =
  | {
      kind: "generate";
      width: number;
      height: number;
      rgba: string;
      params: GenerationParams;
      selection: PaletteSelection;
    }
  | { kind: "pdf"; project: ProjectFile; font: string }
  | { kind: "zip"; files: Record<string, string> };
