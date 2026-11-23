import type { RoleRequest } from "@/lib/roster-generator";

interface UserPool {
  user_id: string;
  discord_username: string;
}

export interface RosterFeasibility {
  requested: number;
  maxFillable: number;
  byRole: { role: string; requested: number; fillable: number }[];
  singleRoleUsers: { role: string; usernames: string[] }[];
}

export function computeRosterFeasibility(
  roles: RoleRequest[],
  suggestions: Record<string, UserPool[]>
): RosterFeasibility {
  const slots = roles.flatMap((r) => Array.from({ length: r.count }, () => r.role));

  const rolesByUser = new Map<string, Set<string>>();
  const nameByUser = new Map<string, string>();
  for (const role of Object.keys(suggestions)) {
    for (const u of suggestions[role] ?? []) {
      if (!rolesByUser.has(u.user_id)) rolesByUser.set(u.user_id, new Set());
      rolesByUser.get(u.user_id)!.add(role);
      nameByUser.set(u.user_id, u.discord_username);
    }
  }

  const slotOwner: (string | null)[] = new Array(slots.length).fill(null);

  function tryAssign(userId: string, visited: Set<number>): boolean {
    for (let s = 0; s < slots.length; s++) {
      if (visited.has(s)) continue;
      if (!rolesByUser.get(userId)?.has(slots[s])) continue;
      visited.add(s);
      if (slotOwner[s] === null || tryAssign(slotOwner[s]!, visited)) {
        slotOwner[s] = userId;
        return true;
      }
    }
    return false;
  }

  let maxFillable = 0;
  for (const userId of rolesByUser.keys()) {
    if (tryAssign(userId, new Set())) maxFillable++;
  }

  const fillableByRole = new Map<string, number>();
  slots.forEach((role, i) => {
    if (slotOwner[i]) fillableByRole.set(role, (fillableByRole.get(role) ?? 0) + 1);
  });

  const singleRole = new Map<string, string[]>();
  for (const [userId, userRoles] of rolesByUser) {
    if (userRoles.size !== 1) continue;
    const only = [...userRoles][0];
    if (!singleRole.has(only)) singleRole.set(only, []);
    singleRole.get(only)!.push(nameByUser.get(userId) ?? "?");
  }

  return {
    requested: slots.length,
    maxFillable,
    byRole: roles.map((r) => ({
      role: r.role,
      requested: r.count,
      fillable: fillableByRole.get(r.role) ?? 0,
    })),
    singleRoleUsers: [...singleRole.entries()].map(([role, usernames]) => ({ role, usernames })),
  };
}
