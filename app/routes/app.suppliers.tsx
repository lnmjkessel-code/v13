import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Our field -> label shown on the form. Blank means "same name as ours".
const FIELDS: [string, string][] = [
  ["title", "Title column"],
  ["cost", "Wholesale price column"],
  ["sku", "SKU column"],
  ["description", "Description column"],
  ["vendor", "Vendor / brand column"],
  ["image_url", "Image URL column"],
  ["tags", "Tags column"],
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const suppliers = await prisma.supplier.findMany({
    where: { shop: session.shop },
    orderBy: { name: "asc" },
  });
  return { suppliers };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  if (form.get("intent") === "delete") {
    await prisma.supplier.deleteMany({
      where: { id: String(form.get("id")), shop: session.shop },
    });
    return { error: null };
  }

  const name = String(form.get("name") ?? "").trim();
  const markup = Number(form.get("markupPercent"));
  if (!name) return { error: "Name is required." };
  if (!Number.isFinite(markup) || markup < 0 || markup > 1000) {
    return { error: "Markup must be a number between 0 and 1000." };
  }

  const columnMap: Record<string, string> = {};
  for (const [field] of FIELDS) {
    const v = String(form.get(`map_${field}`) ?? "").trim();
    if (v) columnMap[field] = v;
  }

  try {
    await prisma.supplier.create({
      data: {
        shop: session.shop,
        name,
        markupPercent: markup,
        round99: form.get("round99") === "on",
        columnMap: Object.keys(columnMap).length
          ? JSON.stringify(columnMap)
          : null,
      },
    });
  } catch {
    return { error: `A supplier named "${name}" already exists.` };
  }
  return { error: null };
};

export default function Suppliers() {
  const { suppliers } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();

  return (
    <s-page heading="Suppliers">
      <s-section heading="Add supplier">
        <s-paragraph>
          Retail price = wholesale price x (1 + markup%). Enter your
          supplier&apos;s exact CSV column headers below; leave a field blank if
          their header already matches ours.
        </s-paragraph>
        {result?.error && <s-banner tone="critical">{result.error}</s-banner>}
        <Form method="post">
          <p>
            <label>
              Name <input name="name" required />
            </label>
          </p>
          <p>
            <label>
              Markup %{" "}
              <input
                name="markupPercent"
                type="number"
                step="0.1"
                min="0"
                defaultValue="100"
              />
            </label>
          </p>
          <p>
            <label>
              <input name="round99" type="checkbox" defaultChecked /> Round
              prices up to x.99
            </label>
          </p>
          {FIELDS.map(([field, label]) => (
            <p key={field}>
              <label>
                {label} <input name={`map_${field}`} />
              </label>
            </p>
          ))}
          <s-button type="submit">Save supplier</s-button>
        </Form>
      </s-section>
      <s-section heading="Your suppliers">
        {suppliers.length === 0 ? (
          <s-paragraph>No suppliers yet.</s-paragraph>
        ) : (
          suppliers.map((sp) => (
            <Form method="post" key={sp.id}>
              <input type="hidden" name="id" value={sp.id} />
              <s-paragraph>
                {sp.name}: {sp.markupPercent}% markup
                {sp.round99 ? ", rounded to .99" : ""}{" "}
                <button type="submit" name="intent" value="delete">
                  Delete
                </button>
              </s-paragraph>
            </Form>
          ))
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
