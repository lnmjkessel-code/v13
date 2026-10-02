import { randomBytes } from "node:crypto";
import db from "../db.server";

export function newToken() {
  return randomBytes(24).toString("base64url");
}

export function downloadUrl(token: string) {
  const base = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  return `${base}/download/${token}`;
}

type OrderPayload = {
  admin_graphql_api_id: string;
  name?: string;
  line_items?: Array<{ product_id?: number | null }>;
};

/**
 * Create (idempotently) one DownloadGrant per matching DigitalAsset on the order.
 * Returns the grants (new or existing) so callers can write them back to the order.
 */
export async function createGrantsForOrder(shop: string, order: OrderPayload) {
  const productIds = (order.line_items ?? [])
    .map((li) => li.product_id)
    .filter((id): id is number => typeof id === "number")
    .map((id) => `gid://shopify/Product/${id}`);

  if (productIds.length === 0) return [];

  const assets = await db.digitalAsset.findMany({
    where: { shop, productId: { in: productIds } },
  });

  const grants = [];
  for (const asset of assets) {
    const existing = await db.downloadGrant.findUnique({
      where: {
        orderId_assetId: { orderId: order.admin_graphql_api_id, assetId: asset.id },
      },
    });
    if (existing) {
      grants.push({ grant: existing, asset });
      continue;
    }
    const grant = await db.downloadGrant.create({
      data: {
        token: newToken(),
        shop,
        orderId: order.admin_graphql_api_id,
        orderName: order.name,
        assetId: asset.id,
        maxDownloads: asset.maxDownloads,
        expiresAt: new Date(Date.now() + asset.expiryDays * 86_400_000),
      },
    });
    grants.push({ grant, asset });
  }
  return grants;
}
