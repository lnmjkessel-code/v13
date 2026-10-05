import { parse } from "csv-parse/sync";

export type ProductRow = {
  title: string;
  description: string;
  vendor: string;
  sku: string;
  price: string;
  cost: string;
  image_url: string;
  tags: string;
};

export type ParsedImport = {
  rows: ProductRow[];
  errors: string[];
};

export type SupplierOptions = {
  markupPercent: number;
  round99: boolean;
  columnMap: Record<string, string>;
};

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, "_");

// Retail = cost * (1 + markup%), optionally rounded up to the next x.99.
export function applyMarkup(
  cost: number,
  markupPercent: number,
  round99: boolean,
): string {
  const raw = cost * (1 + markupPercent / 100);
  const price = round99 ? Math.max(Math.ceil(raw) - 0.01, 0.99) : raw;
  return price.toFixed(2);
}

export function parseProductCsv(
  text: string,
  supplier?: SupplierOptions,
): ParsedImport {
  // Supplier column map is { ourField: "Their Header" }; invert it by header.
  const reverse: Record<string, string> = {};
  for (const [ours, theirs] of Object.entries(supplier?.columnMap ?? {})) {
    reverse[norm(theirs)] = ours;
  }
  const records: Record<string, string>[] = parse(text, {
    columns: (header: string[]) =>
      header.map((h) => reverse[norm(h)] ?? norm(h)),
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });

  const errors: string[] = [];
  const rows: ProductRow[] = [];

  records.forEach((r, i) => {
    const line = i + 2;
    // With a supplier, the price column is wholesale cost and retail is derived.
    const costField = r.cost || (supplier ? r.price : "");
    const required = supplier ? ["title", "cost"] : ["title", "price"];
    const present = { ...r, cost: costField };
    const missing = required.filter((k) => !present[k as keyof typeof present]);
    if (missing.length) {
      errors.push(`Line ${line}: missing ${missing.join(", ")}`);
      return;
    }
    const costNum = costField ? Number(costField) : NaN;
    if (costField && (Number.isNaN(costNum) || costNum < 0)) {
      errors.push(`Line ${line}: invalid cost "${costField}"`);
      return;
    }
    if (!supplier && (Number.isNaN(Number(r.price)) || Number(r.price) < 0)) {
      errors.push(`Line ${line}: invalid price "${r.price}"`);
      return;
    }
    rows.push({
      title: r.title,
      description: r.description ?? "",
      vendor: r.vendor ?? "",
      sku: r.sku ?? "",
      price: supplier
        ? applyMarkup(costNum, supplier.markupPercent, supplier.round99)
        : Number(r.price).toFixed(2),
      cost: costField ? costNum.toFixed(2) : "",
      image_url: r.image_url ?? "",
      tags: r.tags ?? "",
    });
  });

  return { rows, errors };
}

export function toProductSetInput(row: ProductRow) {
  return {
    title: row.title,
    descriptionHtml: row.description,
    vendor: row.vendor || undefined,
    tags: row.tags
      ? row.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined,
    status: "DRAFT",
    productOptions: [
      { name: "Title", position: 1, values: [{ name: "Default Title" }] },
    ],
    variants: [
      {
        optionValues: [{ optionName: "Title", name: "Default Title" }],
        price: row.price,
        sku: row.sku || undefined,
        inventoryItem: {
          tracked: true,
          ...(row.cost ? { cost: row.cost } : {}),
        },
      },
    ],
    files: row.image_url
      ? [{ originalSource: row.image_url, contentType: "IMAGE" }]
      : undefined,
  };
}

export const PRODUCT_SET = `#graphql
  mutation ImportProduct($input: ProductSetInput!) {
    productSet(input: $input, synchronous: true) {
      product { id title handle }
      userErrors { field message code }
    }
  }`;

export const FIND_VARIANT_BY_SKU = `#graphql
  query FindVariantBySku($q: String!) {
    productVariants(first: 1, query: $q) {
      nodes { id sku product { id } }
    }
  }`;

export const UPDATE_VARIANT = `#graphql
  mutation UpdateVariantPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id price }
      userErrors { field message code }
    }
  }`;

export const skuQuery = (sku: string) => `sku:"${sku.replace(/["\\]/g, "")}"`;
