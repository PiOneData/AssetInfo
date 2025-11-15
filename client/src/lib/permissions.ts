export type UserRole = "technician" | "it-manager" | "admin" | "super-admin" | string | undefined;

const isRole = (role: UserRole, targets: string[]) => role ? targets.includes(role) : false;

export function getRolePermissions(role: UserRole) {
  const isTechnician = role === "technician";
  const isItManager = role === "it-manager";
  const isAdmin = role === "admin";
  const isSuperAdmin = role === "super-admin";

  const elevatedForAssets = isSuperAdmin || isAdmin || isItManager;
  const elevatedForVendors = isSuperAdmin || isAdmin || isItManager;
  const elevatedForTickets = isSuperAdmin || isAdmin || isItManager;

  return {
    role: role ?? "technician",
    isTechnician,
    isItManager,
    isAdmin,
    isSuperAdmin,
    canUseQuickActions: !isTechnician,
    canViewTeamManagement: isSuperAdmin || isAdmin,
    canManageTeam: isSuperAdmin || isAdmin,
    canViewReports: isSuperAdmin || isAdmin || isItManager,
    canViewAISettings: isSuperAdmin || isAdmin,
    canViewVendors: !isTechnician,
    canEditVendors: elevatedForVendors,
    canDeleteVendors: isSuperAdmin || isAdmin,
    canManageAssets: elevatedForAssets,
    canDeleteAssets: isSuperAdmin || isAdmin,
    canBulkUploadAssets: elevatedForAssets,
    canViewEnrollmentLink: elevatedForAssets,
    canGenerateAIRecommendations: isSuperAdmin || isAdmin,
    canViewAIRecommendations: true,
    canCreateTickets: !isTechnician,
    canEditTickets: elevatedForTickets,
    canDeleteTickets: isSuperAdmin || isAdmin,
    canAssignTickets: elevatedForTickets,
    canUpdateTicketStatus: elevatedForTickets,
    canCommentOnTickets: elevatedForTickets,
    canAccessOrgSettings: isSuperAdmin || isAdmin,
    canEditOrgSettings: isSuperAdmin,
  };
}

export type RolePermissions = ReturnType<typeof getRolePermissions>;
