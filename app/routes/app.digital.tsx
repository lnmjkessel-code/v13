import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const assets = await db.digitalAsset.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { grants: true } } },
  });
  return { assets };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "delete") {
    await db.digitalAsset.deleteMany({
      where: { id: String(form.get("id")), shop: session.shop },
    });
    return { ok: true };
  }

  const productId = String(form.get("productId") || "");
  const title = String(form.get("title") || "").trim();
  const fileUrl = String(form.get("fileUrl") || "").trim();
  if (!productId || !title || !/^https:\/\//.test(fileUrl)) {
    return { ok: false, error: "Pick a product, add a title, and use an https:// file URL." };
  }

  await db.digitalAsset.create({
    data: {
      shop: session.shop,
      productId,
      title,
      fileUrl,
      description: String(form.get("description") || "") || null,
      maxDownloads: Math.max(1, Number(form.get("maxDownloads")) || 5),
      expiryDays: Math.max(1, Number(form.get("expiryDays")) || 30),
    },
  });
  return { ok: true };
};

export default function DigitalProducts() {
  const { assets } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [product, setProduct] = useState<{ id: string; title: string } | null>(null);

  const pickProduct = async () => {
    const selected = await shopify.resourcePicker({ type: "product", multiple: false });
    if (selected?.[0]) setProduct({ id: selected[0].id, title: selected[0].title });
  };

  return (
    <s-page heading="Digital Products">
      <s-section heading="Attach a file to a product">
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="create" />
          <input type="hidden" name="productId" value={product?.id ?? ""} />
          <s-stack gap="base">
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-button onClick={pickProduct}>
                {product ? "Change product" : "Choose product"}
              </s-button>
              {product && <s-text>{product.title}</s-text>}
            </s-stack>
            <s-text-field name="title" label="Download title" placeholder="Nak Muay 8-Week Camp (PDF)" />
            <s-url-field name="fileUrl" label="File URL (https)" placeholder="https://…/camp.pdf" />
            <s-text-field name="description" label="Description (optional)" />
            <s-stack direction="inline" gap="base">
              <s-number-field name="maxDownloads" label="Max downloads" value="5" min={1} />
              <s-number-field name="expiryDays" label="Link valid (days)" value="30" min={1} />
            </s-stack>
            {fetcher.data && !fetcher.data.ok && "error" in fetcher.data && (
              <s-banner tone="critical">{fetcher.data.error}</s-banner>
            )}
            <s-button type="submit" variant="primary" {...(fetcher.state !== "idle" ? { loading: true } : {})}>
              Save
            </s-button>
          </s-stack>
        </fetcher.Form>
      </s-section>

      <s-section heading="Your digital products">
        {assets.length === 0 ? (
          <s-paragraph>Nothing yet. Attach your first file above.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Title</s-table-header>
              <s-table-header>Limits</s-table-header>
              <s-table-header>Links issued</s-table-header>
              <s-table-header></s-table-header>
            </s-table-header-row>
            <s-table-body>
              {assets.map((a) => (
                <s-table-row key={a.id}>
                  <s-table-cell>{a.title}</s-table-cell>
                  <s-table-cell>
                    {a.maxDownloads}x / {a.expiryDays}d
                  </s-table-cell>
                  <s-table-cell>{a._count.grants}</s-table-cell>
                  <s-table-cell>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="id" value={a.id} />
                      <s-button type="submit" tone="critical" variant="tertiary">
                        Delete
                      </s-button>
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
