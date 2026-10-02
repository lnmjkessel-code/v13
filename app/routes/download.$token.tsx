import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import db from "../db.server";

/**
 * Public download endpoint (no admin auth — the unguessable token IS the auth).
 * Enforces expiry + download limits, then redirects to the real file.
 */
export const loader = async ({ params }: LoaderFunctionArgs) => {
  const grant = await db.downloadGrant.findUnique({
    where: { token: params.token ?? "" },
    include: { asset: true },
  });

  if (!grant) throw new Response("Link not found.", { status: 404 });
  if (grant.expiresAt < new Date()) throw new Response("This link has expired.", { status: 410 });
  if (grant.downloadsUsed >= grant.maxDownloads) {
    throw new Response("Download limit reached. Contact V13 support.", { status: 410 });
  }

  // Atomic-ish increment guarded by the limit
  const { count } = await db.downloadGrant.updateMany({
    where: { id: grant.id, downloadsUsed: { lt: grant.maxDownloads } },
    data: { downloadsUsed: { increment: 1 } },
  });
  if (count === 0) throw new Response("Download limit reached.", { status: 410 });

  return redirect(grant.asset.fileUrl);
};
