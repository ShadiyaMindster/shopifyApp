import { useEffect } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return null;
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
    },
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
    },
  );
  const variantResponseJson = await variantResponse.json();

  return {
    product: responseJson.data.productCreate.product,
    variant: variantResponseJson.data.productVariantsBulkUpdate.productVariants,
  };
};


export default function Index() {
  return (
    <div style={{ padding: "20px" }}>
      <h1>Hello World 👋</h1>
    </div>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

import { json } from "@remix-run/node";
import { useLoaderData } from "react-router";
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

  return json({
    products: result.data.products.edges.map(e => e.node),
  });
};

export default function ProductsPage() {
  const { products } = useLoaderData();

  return (
    <div style={{ padding: 20 }}>
      <h1>Products</h1>

      {products.length === 0 && <p>No products found</p>}

      <ul>
        {products.map(product => (
          <li key={product.id}>
            <strong>{product.title}</strong> — {product.status}
          </li>
        ))}
      </ul>
    </div>
  );
}

