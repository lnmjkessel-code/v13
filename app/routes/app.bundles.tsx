import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

/** Must match `handle` in extensions/v13-fight-camp-bundle/shopify.extension.toml */
const FUNCTION_HANDLE = "v13-fight-camp-bundle";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const res = await admin.graphql(`#graphql
    query v13Discounts {
      discountNodes(first: 25, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          discount {
            __typename
            ... on DiscountAutomaticApp { title status }
          }
        }
      }
    }`);
  const json = await res.json();
  const discounts = (json.data?.discountNodes?.nodes ?? []).filter(
    (n: { discount: { __typename: string } }) => n.discount.__typename === "DiscountAutomaticApp",
  );
  return { discounts };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "delete") {
    const res = await admin.graphql(
      `#graphql
      mutation v13DeleteDiscount($id: ID!) {
        discountAutomaticDelete(id: $id) { userErrors { message } }
      }`,
      { variables: { id: String(form.get("id")) } },
    );
    const json = await res.json();
    return { ok: !json.data?.discountAutomaticDelete?.userErrors?.length };
  }

  const title = String(form.get("title") || "Fight Camp Bundle").trim();
  const minQuantity = Math.max(2, Number(form.get("minQuantity")) || 3);
  const percent = Math.min(80, Math.max(1, Number(form.get("percent")) || 15));

  const res = await admin.graphql(
    `#graphql
    mutation v13CreateDiscount($discount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $discount) {
        automaticAppDiscount { discountId }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        discount: {
          title,
          functionHandle: FUNCTION_HANDLE,
          startsAt: new Date().toISOString(),
          discountClasses: ["PRODUCT"],
          metafields: [
            {
              namespace: "$app:bundle",
              key: "config",
              type: "json",
              value: JSON.stringify({ minQuantity, percent }),
            },
          ],
        },
      },
    },
  );
  const json = await res.json();
  const errors = json.data?.discountAutomaticAppCreate?.userErrors ?? [];
  if (errors.length) return { ok: false, error: errors.map((e: { message: string }) => e.message).join("; ") };
  return { ok: true };
};

export default function Bundles() {
  const { discounts } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  return (
    <s-page heading="Fight Camp Bundles">
      <s-section heading="How it works">
        <s-paragraph>
          Tag products <code>fight-camp</code> in Shopify. When a cart holds at least the
          minimum quantity of tagged items, they get the percentage off — automatically, at
          checkout, no code.
        </s-paragraph>
      </s-section>

      <s-section heading="Create a bundle discount">
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="create" />
          <s-stack gap="base">
            <s-text-field name="title" label="Discount name" value="Fight Camp Bundle" />
            <s-stack direction="inline" gap="base">
              <s-number-field name="minQuantity" label="Minimum items" value="3" min={2} />
              <s-number-field name="percent" label="Percent off" value="15" min={1} max={80} />
            </s-stack>
            {fetcher.data && "error" in fetcher.data && fetcher.data.error && (
              <s-banner tone="critical">{fetcher.data.error}</s-banner>
            )}
            <s-button type="submit" variant="primary">Create discount</s-button>
          </s-stack>
        </fetcher.Form>
      </s-section>

      <s-section heading="Active app discounts">
        {discounts.length === 0 ? (
          <s-paragraph>None yet.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Name</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header></s-table-header>
            </s-table-header-row>
            <s-table-body>
              {discounts.map((d: { id: string; discount: { title: string; status: string } }) => (
                <s-table-row key={d.id}>
                  <s-table-cell>{d.discount.title}</s-table-cell>
                  <s-table-cell>{d.discount.status}</s-table-cell>
                  <s-table-cell>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="id" value={d.id} />
                      <s-button type="submit" tone="critical" variant="tertiary">Delete</s-button>
                    </fetcher.Form>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
