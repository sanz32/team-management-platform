import { decideAppeal } from "@/lib/point-appeal-decision";

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return decideAppeal(params, true);
}
