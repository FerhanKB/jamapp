export type Source = "youtube" | "spotify";

export interface Track {
  source: Source;
  source_id: string;
  title: string;
  artist: string;
  cover: string;
  duration_ms: number;
}
