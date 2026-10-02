import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Mandatory privacy webhooks: customers/data_request, customers/redact, shop/redact.
 * We store no customer PII beyond order ids/names on download grants.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  switch (topic) {
    case "CUSTOMERS_REDACT": {
      const orderIds = ((payload as { orders_to_redact?: number[] }).orders_to_redact ?? []).map(
        (id) => `gid://shopify/Order/${id}`,
      );
      if (orderIds.length) {
        await db.downloadGrant.deleteMany({ where: { shop, orderId: { in: orderIds } } });
      }
      break;
    }
    case "SHOP_REDACT":
      await db.downloadGrant.deleteMany({ where: { shop } });
      await db.digitalAsset.deleteMany({ where: { shop } });
      await db.session.deleteMany({ where: { shop } });
      break;
    case "CUSTOMERS_DATA_REQUEST":
    default:
      // Nothing personal stored. Merchant can export grants from the app if ever needed.
      break;
  }

  return new Response();
};
