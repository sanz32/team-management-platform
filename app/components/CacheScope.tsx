"use client";

import { setCacheOwner } from "@/lib/data-cache";

export default function CacheScope({ ownerId }: { ownerId: string | null }) {
  setCacheOwner(ownerId);
  return null;
}
