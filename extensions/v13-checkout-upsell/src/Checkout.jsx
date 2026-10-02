import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

export default async () => {
  render(<Extension />, document.body);
};

const VARIANT_QUERY = `
  query V13Upsell($id: ID!) {
    node(id: $id) {
      ... on ProductVariant {
        id
        title
        availableForSale
        price { amount }
        image { url }
        product { title }
      }
    }
  }
`;

function Extension() {
  const variantId = shopify.settings.value.upsell_variant;
  const headline = shopify.settings.value.headline || shopify.i18n.translate("headline");

  const [variant, setVariant] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!variantId) return;
    shopify
      .query(VARIANT_QUERY, { variables: { id: variantId } })
      .then(({ data }) => setVariant(data?.node ?? null))
      .catch(() => setVariant(null));
  }, [variantId]);

  // Already in the cart? Don't nag.
  const inCart = shopify.lines.value.some((l) => l.merchandise.id === variantId);

  if (!variantId || !variant || !variant.availableForSale || inCart) return null;

  async function add() {
    setBusy(true);
    setFailed(false);
    const result = await shopify.applyCartLinesChange({
      type: "addCartLine",
      merchandiseId: variantId,
      quantity: 1,
    });
    if (result.type === "error") setFailed(true);
    setBusy(false);
  }

  const label =
    variant.title && variant.title !== "Default Title"
      ? `${variant.product.title} — ${variant.title}`
      : variant.product.title;

  return (
    <s-stack gap="base">
      <s-heading>{headline}</s-heading>
      <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
        <s-stack direction="inline" gap="base" alignItems="center">
          {variant.image?.url && (
            <s-image src={variant.image.url} alt={label} inlineSize="fill" />
          )}
          <s-stack gap="none">
            <s-text type="strong">{label}</s-text>
            <s-text>{shopify.i18n.formatCurrency(Number(variant.price.amount))}</s-text>
          </s-stack>
        </s-stack>
        <s-button onClick={add} loading={busy} disabled={busy}>
          {busy ? shopify.i18n.translate("adding") : shopify.i18n.translate("add")}
        </s-button>
      </s-stack>
      {failed && <s-banner tone="critical">{shopify.i18n.translate("error")}</s-banner>}
    </s-stack>
  );
}
