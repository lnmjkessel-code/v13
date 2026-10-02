import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [assets, grants, used] = await Promise.all([
    db.digitalAsset.count({ where: { shop: session.shop } }),
    db.downloadGrant.count({ where: { shop: session.shop } }),
    db.downloadGrant.aggregate({
      where: { shop: session.shop },
      _sum: { downloadsUsed: true },
    }),
  ]);
  return { assets, grants, downloads: used._sum.downloadsUsed ?? 0 };
};

export default function Index() {
  const { assets, grants, downloads } = useLoaderData<typeof loader>();

  return (
    <s-page heading="V13 Command Center">
      <s-section heading="Digital delivery">
        <s-stack direction="inline" gap="large">
          <s-box padding="base" border="base" borderRadius="base">
            <s-heading>{assets}</s-heading>
            <s-text color="subdued">Digital products</s-text>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-heading>{grants}</s-heading>
            <s-text color="subdued">Links issued</s-text>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-heading>{downloads}</s-heading>
            <s-text color="subdued">Downloads served</s-text>
          </s-box>
        </s-stack>
      </s-section>

      <s-section heading="The three phases">
        <s-unordered-list>
          <s-list-item>
            <s-link href="/app/digital">Phase 1 — Digital Products:</s-link> attach
            a file to any product. Paid orders get a private, expiring link.
          </s-list-item>
          <s-list-item>
            <s-link href="/app/bundles">Phase 2 — Fight Camp Bundles:</s-link>{" "}
            auto-discount when a cart holds enough products tagged{" "}
            <code>fight-camp</code>.
          </s-list-item>
          <s-list-item>
            <s-link href="/app/storefront">Phase 3 — Storefront:</s-link> the
            size/fit guide block and the checkout upsell.
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
