import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

export const CURRENT_BUSINESS_COOKIE = "currentBusinessId";

export async function getUserMemberships(userId: string) {
  return prisma.membership.findMany({
    where: { userId },
    include: { business: true },
    orderBy: { business: { name: "asc" } },
  });
}

/**
 * Resolves the signed-in user and their active business, redirecting to
 * /login or /select-business when either is missing. Every membership
 * check happens against the DB, not the JWT, so revoking access takes
 * effect immediately without waiting for token refresh.
 */
export async function requireCurrentBusiness() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const memberships = await getUserMemberships(session.user.id);
  if (memberships.length === 0) {
    redirect("/no-access");
  }

  const cookieStore = await cookies();
  const requestedId = cookieStore.get(CURRENT_BUSINESS_COOKIE)?.value;

  const active =
    memberships.find((m) => m.businessId === requestedId) ?? memberships[0];

  return {
    user: session.user,
    business: active.business,
    role: active.role,
    memberships,
  };
}
