import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { createGrantsForOrder, downloadUrl } from "../lib/delivery.server";

/**
 * Phase 1 — Digital delivery.
 * When an order is paid, mint a private download link for every digital product on it
 * and write the links onto the order (visible in admin, and available to
 * notification templates as {{ note }}).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const results = await createGrantsForOrder(shop, payload as never);
  if (results.length === 0 || !admin) return new Response();

  const lines = results.map(
    ({ grant, asset }) => `${asset.title}: ${downloadUrl(grant.token)}`,
  );
  const note = `V13 DOWNLOADS\n${lines.join("\n")}`;

  const res = await admin.graphql(
    `#graphql
    mutation v13OrderNote($input: OrderInput!) {
      orderUpdate(input: $input) {
        order { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: {
          id: (payload as { admin_graphql_api_id: string }).admin_graphql_api_id,
          note,
          tags: ["v13-digital"],
        },
      },
    },
  );
  const json = await res.json();
  const errors = json.data?.orderUpdate?.userErrors;
  if (errors?.length) console.error("orderUpdate userErrors", errors);

  return new Response();
};
