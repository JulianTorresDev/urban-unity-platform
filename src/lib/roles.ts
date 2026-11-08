export type AppRole = 'super_admin' | 'admin' | 'resident';

const RANK: Record<AppRole, number> = { resident: 1, admin: 2, super_admin: 3 };

const isAppRole = (value: unknown): value is AppRole =>
  typeof value === 'string' && value in RANK;

/**
 * Rol efectivo de un usuario a partir de sus filas en user_roles.
 * Si por datos antiguos tiene varias, gana la de mayor jerarquía; sin filas es residente.
 */
export function highestRole(roles: ReadonlyArray<unknown>): AppRole {
  return roles.filter(isAppRole).reduce<AppRole>(
    (best, role) => (RANK[role] > RANK[best] ? role : best),
    'resident'
  );
}

export const isAdminRole = (role: AppRole | null | undefined) => role === 'admin' || role === 'super_admin';

/** Agrupa filas de user_roles por usuario y devuelve el rol efectivo de cada uno. */
export function rolesByUser(rows: ReadonlyArray<{ user_id: string; role: unknown }>): Map<string, AppRole> {
  const grouped = new Map<string, unknown[]>();
  for (const { user_id, role } of rows) {
    grouped.set(user_id, [...(grouped.get(user_id) ?? []), role]);
  }
  return new Map([...grouped].map(([id, list]) => [id, highestRole(list)]));
}
