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

const REQUIRED = ["title", "price"] as const;

export function parseProductCsv(text: string): ParsedImport {
  const records: Record<string, string>[] = parse(text, {
    columns: (header: string[]) =>
      header.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_")),
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });

  const errors: string[] = [];
  const rows: ProductRow[] = [];

  records.forEach((r, i) => {
    const line = i + 2;
    const missing = REQUIRED.filter((k) => !r[k]);
    if (missing.length) {
      errors.push(`Line ${line}: missing ${missing.join(", ")}`);
      return;
    }
    if (Number.isNaN(Number(r.price)) || Number(r.price) < 0) {
      errors.push(`Line ${line}: invalid price "${r.price}"`);
      return;
    }
    if (r.cost && Number.isNaN(Number(r.cost))) {
      errors.push(`Line ${line}: invalid cost "${r.cost}"`);
      return;
    }
    rows.push({
      title: r.title,
      description: r.description ?? "",
      vendor: r.vendor ?? "",
      sku: r.sku ?? "",
      price: Number(r.price).toFixed(2),
      cost: r.cost ? Number(r.cost).toFixed(2) : "",
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
