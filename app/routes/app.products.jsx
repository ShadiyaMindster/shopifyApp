import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
    const { admin } = await authenticate.admin(request);

    const response = await admin.graphql(
        `#graphql
      query GetProducts($first: Int!) {
        products(first: $first) {
          edges {
            node {
              id
              title
              status
              handle
              createdAt
            }
          }
        }
      }
    `,
        {
            variables: { first: 20 },
        }
    );

    const result = await response.json();

    return {
        products: result.data.products.edges.map(e => e.node),
    };
};

export const action = async ({ request }) => {
    const { admin } = await authenticate.admin(request);
    const color = ["Red", "Orange", "Yellow", "Green"][
        Math.floor(Math.random() * 4)
    ];
    const response = await admin.graphql(
        `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
          }
        }
      }`,
        {
            variables: {
                product: {
                    title: `${color} Snowboard`,
                },
            },
        }
    );

    const responseJson = await response.json();
    const product = responseJson.data.productCreate.product;
    const variantId = product.variants.edges[0].node.id;

    const variantResponse = await admin.graphql(
        `#graphql
    mutation shopifyReactRouterTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          barcode
          createdAt
        }
      }
    }`,
        {
            variables: {
                productId: product.id,
                variants: [{ id: variantId, price: "100.00" }],
            },
        }
    );

    const variantResponseJson = await variantResponse.json();

    return {
        product: responseJson.data.productCreate.product,
        variant: variantResponseJson.data.productVariantsBulkUpdate.productVariants,
    };
};

export default function ProductsPage() {
    const { products } = useLoaderData();
    const fetcher = useFetcher();

    const isLoading =
        ["loading", "submitting"].includes(fetcher.state) &&
        fetcher.formMethod === "POST";

    useEffect(() => {
        if (fetcher.data && fetcher.state === "idle") {
            shopify.toast.show("Product populated");
        }
    }, [fetcher.data, fetcher.state]);

    const populateProduct = () => fetcher.submit({}, { method: "POST" });

    return (
        <div style={{ padding: "20px" }}>
            <h1>Products List</h1>
            <p style={{ marginBottom: "20px" }}>
                Manage your store's products here.
            </p>

            <button
                onClick={populateProduct}
                disabled={isLoading}
                style={{
                    padding: "10px 20px",
                    backgroundColor: "#008060",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    marginBottom: "20px"
                }}
            >
                {isLoading ? "Populating..." : "Populate Product"}
            </button>

            {products.length === 0 ? (
                <p>No products found</p>
            ) : (
                <ul style={{ listStyleType: "none", padding: 0 }}>
                    {products.map((product) => (
                        <li key={product.id} style={{ padding: "10px", borderBottom: "1px solid #eee" }}>
                            <strong>{product.title}</strong> — <span style={{ color: "#666" }}>{product.status}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
