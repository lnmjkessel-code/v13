import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  // eslint-disable-next-line no-undef
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const store = session.shop.replace(".myshopify.com", "");
  return {
    // Deep link: opens the theme editor on a product template with the size guide block added
    sizeGuideUrl: `https://admin.shopify.com/store/${store}/themes/current/editor?template=product&addAppBlockId=${apiKey}/size-guide&target=mainSection`,
    checkoutEditorUrl: `https://admin.shopify.com/store/${store}/settings/checkout/editor`,
  };
};

export default function Storefront() {
  const { sizeGuideUrl, checkoutEditorUrl } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Storefront Tools">
      <s-section heading="Size & fit guide (theme block)">
        <s-paragraph>
          Adds a V13 fit chart to product pages. Pick the chart (shorts, rash guard, hoodie, tee)
          and the fit note per block.
        </s-paragraph>
        <s-button href={sizeGuideUrl} target="_blank" variant="primary">
          Add to product page
        </s-button>
      </s-section>

      <s-section heading="Checkout upsell">
        <s-paragraph>
          Shows a one-tap add-on (gloves wraps, a program, a sticker pack — your call) at checkout.
          In the checkout editor, add the <strong>V13 Checkout Upsell</strong> block and choose
          the variant to offer.
        </s-paragraph>
        <s-button href={checkoutEditorUrl} target="_blank">
          Open checkout editor
        </s-button>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
