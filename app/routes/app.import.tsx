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
  PRODUCT_SET,
  parseProductCsv,
  toProductSetInput,
} from "../import.server";

const MAX_ROWS = 200;
const MAX_BYTES = 2 * 1024 * 1024;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const jobs = await prisma.importJob.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return { jobs };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const file = (await request.formData()).get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file.", created: 0, errors: [] as string[] };
  }
  if (file.size > MAX_BYTES) {
    return { error: "File is over 2 MB.", created: 0, errors: [] as string[] };
  }

  let parsed: ReturnType<typeof parseProductCsv>;
  try {
    parsed = parseProductCsv(await file.text());
  } catch (e) {
    return {
      error: `Could not read CSV: ${(e as Error).message}`,
      created: 0,
      errors: [] as string[],
    };
  }
  const { rows, errors } = parsed;
  if (rows.length > MAX_ROWS) {
    return {
      error: `Max ${MAX_ROWS} products per import (got ${rows.length}).`,
      created: 0,
      errors: [] as string[],
    };
  }

  let created = 0;
  for (const [i, row] of rows.entries()) {
    try {
      const res = await admin.graphql(PRODUCT_SET, {
        variables: { input: toProductSetInput(row) },
      });
      const json = await res.json();
      const userErrors = json.data?.productSet?.userErrors ?? [];
      if (userErrors.length || !json.data?.productSet?.product) {
        errors.push(
          `Row ${i + 1} (${row.title}): ${
            userErrors.map((e: { message: string }) => e.message).join("; ") ||
            "unknown error"
          }`,
        );
      } else {
        created++;
      }
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
      failed: errors.length,
      errors: errors.length ? errors.join("\n").slice(0, 10000) : null,
    },
  });

  return { error: null, created, errors };
};

export default function ImportPage() {
  const { jobs } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state === "submitting";

  return (
    <s-page heading="Import products">
      <s-section heading="Upload CSV">
        <s-paragraph>
          Columns: title, price (required); description, vendor, sku, cost,
          image_url, tags (optional). Products are created as drafts.
        </s-paragraph>
        <Form method="post" encType="multipart/form-data">
          <input type="file" name="file" accept=".csv,text/csv" required />
          <s-button type="submit" {...(busy ? { loading: true } : {})}>
            Import
          </s-button>
        </Form>
        {result?.error && <s-banner tone="critical">{result.error}</s-banner>}
        {result && !result.error && (
          <s-banner tone={result.errors.length ? "warning" : "success"}>
            Created {result.created} product(s).
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
              {j.created}/{j.total} created, {j.failed} problem(s)
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
