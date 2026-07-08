export const ROLES = {
  ADMIN: "admin",
  GERENCIA: "gerencia",
  VENTAS: "ventas",
  ALMACEN: "almacen",
};

export const ROL_LABEL = {
  [ROLES.ADMIN]: "Admin",
  [ROLES.GERENCIA]: "Gerencia",
  [ROLES.VENTAS]: "Ventas",
  [ROLES.ALMACEN]: "Almacén",
};

export function tienePermiso(rol, rolesPermitidos) {
  return rolesPermitidos.includes(rol);
}
