export interface TierPiece {
  itemId: number;
  name: string;
  iconUrl: string | null;
  slot: string | null;
  equipped: boolean;
}

export interface TierSetGroup {
  setId: number;
  setName: string;
  count: number;
  pieces: TierPiece[];
}

export interface TierInfo {
  tierPieceCount: number;
  tierSetName: string | null;
  tierSets: TierSetGroup[];
}
