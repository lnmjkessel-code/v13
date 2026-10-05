import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  FIND_VARIANT_BY_SKU,
  PRODUCT_SET,
  UPDATE_VARIANT,
  parseProductCsv,
  skuQuery,
  toProductSetInput,
} from "../import.server";
import type { ProductRow, SupplierOptions } from "../import.server";

const MAX_ROWS = 200;
const MAX_BYTES = 2 * 1024 * 1024;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const jobs = await prisma.importJob.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const suppliers = await prisma.supplier.findMany({
    where: { shop: session.shop },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return { jobs, suppliers };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const file = form.get("file");
  const supplierId = String(form.get("supplierId") ?? "");

  if (!(file instanceof File) || file.size === 0) {
    return {
      error: "Choose a CSV file.",
      created: 0,
      updated: 0,
      errors: [] as string[],
    };
  }
  if (file.size > MAX_BYTES) {
    return {
      error: "File is over 2 MB.",
      created: 0,
      updated: 0,
      errors: [] as string[],
    };
  }

  let supplier: SupplierOptions | undefined;
  if (supplierId) {
    const row = await prisma.supplier.findFirst({
      where: { id: supplierId, shop: session.shop },
    });
    if (!row)
      return {
        error: "Supplier not found.",
        created: 0,
        updated: 0,
        errors: [] as string[],
      };
    supplier = {
      markupPercent: row.markupPercent,
      round99: row.round99,
      columnMap: row.columnMap ? JSON.parse(row.columnMap) : {},
    };
  }

  let parsed: ReturnType<typeof parseProductCsv>;
  try {
    parsed = parseProductCsv(await file.text(), supplier);
  } catch (e) {
    return {
      error: `Could not read CSV: ${(e as Error).message}`,
      created: 0,
      updated: 0,
      errors: [] as string[],
    };
  }
  const { rows, errors } = parsed;
  if (rows.length > MAX_ROWS) {
    return {
      error: `Max ${MAX_ROWS} products per import (got ${rows.length}).`,
      created: 0,
      updated: 0,
      errors: [] as string[],
    };
  }

  let created = 0;
  let updated = 0;
  for (const [i, row] of rows.entries()) {
    try {
      const outcome = await upsertRow(admin, row);
      if (outcome === "created") created++;
      else updated++;
    } catch (e) {
      errors.push(`Row ${i + 1} (${row.title}): ${(e as Error).message}`);
    }
  }

  await prisma.importJob.create({
    data: {
      shop: session.shop,
      filename: file.name,
      total: rows.length,
      created,
      updated,
      failed: errors.length,
      errors: errors.length ? errors.join("\n").slice(0, 10000) : null,
    },
  });

  return { error: null, created, updated, errors };
};

type Admin = Awaited<ReturnType<typeof authenticate.admin>>["admin"];

const messages = (userErrors: { message: string }[]) =>
  userErrors.map((e) => e.message).join("; ") || "unknown error";

// Existing SKU: update price/cost only, so edited titles, copy and status survive.
async function upsertRow(
  admin: Admin,
  row: ProductRow,
): Promise<"created" | "updated"> {
  if (row.sku) {
    const found = await (
      await admin.graphql(FIND_VARIANT_BY_SKU, {
        variables: { q: skuQuery(row.sku) },
      })
    ).json();
    const variant = found.data?.productVariants?.nodes?.[0];
    if (variant && variant.sku === row.sku) {
      const res = await (
        await admin.graphql(UPDATE_VARIANT, {
          variables: {
            productId: variant.product.id,
            variants: [
              {
                id: variant.id,
                price: row.price,
                ...(row.cost ? { inventoryItem: { cost: row.cost } } : {}),
              },
            ],
          },
        })
      ).json();
      const userErrors = res.data?.productVariantsBulkUpdate?.userErrors ?? [];
      if (userErrors.length) throw new Error(messages(userErrors));
      return "updated";
    }
  }
  const res = await (
    await admin.graphql(PRODUCT_SET, {
      variables: { input: toProductSetInput(row) },
    })
  ).json();
  const userErrors = res.data?.productSet?.userErrors ?? [];
  if (userErrors.length || !res.data?.productSet?.product) {
    throw new Error(messages(userErrors));
  }
  return "created";
}

export default function ImportPage() {
  const { jobs, suppliers } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state === "submitting";

  return (
    <s-page heading="Import products">
      <s-section heading="Upload CSV">
        <s-paragraph>
          Columns: title, price (required); description, vendor, sku, cost,
          image_url, tags (optional). New products are created as drafts. A SKU
          that already exists has its price and cost updated instead.
        </s-paragraph>
        <Form method="post" encType="multipart/form-data">
          <select name="supplierId" defaultValue="">
            <option value="">
              No supplier (CSV price is the retail price)
            </option>
            {suppliers.map((sp) => (
              <option key={sp.id} value={sp.id}>
                {sp.name} (CSV price is wholesale cost; markup applied)
              </option>
            ))}
          </select>
          <input type="file" name="file" accept=".csv,text/csv" required />
          <s-button type="submit" {...(busy ? { loading: true } : {})}>
            Import
          </s-button>
        </Form>
        {result?.error && <s-banner tone="critical">{result.error}</s-banner>}
        {result && !result.error && (
          <s-banner tone={result.errors.length ? "warning" : "success"}>
            Created {result.created}, updated {result.updated}.
            {result.errors.length > 0 && ` ${result.errors.length} problem(s):`}
            {result.errors.map((e) => (
              <div key={e}>{e}</div>
            ))}
          </s-banner>
        )}
      </s-section>
      <s-section heading="Recent imports">
        {jobs.length === 0 ? (
          <s-paragraph>No imports yet.</s-paragraph>
        ) : (
          jobs.map((j) => (
            <s-paragraph key={j.id}>
              {new Date(j.createdAt).toLocaleString()} — {j.filename}:{" "}
              {j.created} created, {j.updated} updated of {j.total}, {j.failed}{" "}
              problem(s)
            </s-paragraph>
          ))
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
