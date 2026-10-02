// @ts-check

/**
 * Fight Camp Bundle:
 * If the cart holds >= minQuantity units of products tagged "fight-camp",
 * take `percent` off every one of those lines.
 *
 * Config comes from the discount's $app:bundle/config JSON metafield,
 * written by the admin UI at /app/bundles.
 *
 * @param {any} input  Generated type: CartLinesDiscountsGenerateRunInput
 * @returns {any}      Generated type: CartLinesDiscountsGenerateRunResult
 */
export function cartLinesDiscountsGenerateRun(input) {
  const config = input.discount?.metafield?.jsonValue ?? {};
  const minQuantity = Number(config.minQuantity) || 3;
  const percent = Number(config.percent) || 15;

  // Only run if the merchant created this as a PRODUCT-class discount
  if (!input.discount?.discountClasses?.includes("PRODUCT")) {
    return { operations: [] };
  }

  const eligible = input.cart.lines.filter(
    (/** @type {any} */ line) =>
      line.merchandise.__typename === "ProductVariant" &&
      line.merchandise.product?.hasAnyTag,
  );

  const totalQty = eligible.reduce(
    (/** @type {number} */ sum, /** @type {any} */ line) => sum + line.quantity,
    0,
  );

  if (totalQty < minQuantity) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          selectionStrategy: "FIRST",
          candidates: [
            {
              message: `FIGHT CAMP: ${percent}% OFF`,
              targets: eligible.map((/** @type {any} */ line) => ({
                cartLine: { id: line.id },
              })),
              value: { percentage: { value: percent } },
            },
          ],
        },
      },
    ],
  };
}
