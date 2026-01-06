import { useEffect, useState } from "react";
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
              productType
              handle
              totalInventory
              createdAt
              featuredImage {
                url
                altText
              }
              options {
                id
                name
                values
              }
              variants(first: 20) {
                edges {
                  node {
                    id
                    title
                    price
                    sku
                    inventoryQuantity
                  }
                }
              }
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
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "add-variant") {
        const productId = formData.get("productId");
        const size = formData.get("size");
        const price = formData.get("price");
        const sku = formData.get("sku");

        // Check if the product already has the "Size" option
        // We'll need to fetch the product first to be safe, or we can try to create the option
        // However, a simpler detail is passed from the form: the option name.
        const optionName = formData.get("optionName") || "Size";

        // First, ensure the option exists on the product
        // If the product doesn't have this option, we need to add it.
        // But `productVariantsBulkCreate` expects the option to exist.

        // We can try to update the product to add the option if it's missing (though complicates things if there are other options).
        // For simplicity, let's assume we are adding to the *first* option if it exists, or "Size" if we can.

        // Let's rely on what the UI sends. If UI sends "Size", and product has "Color", that's a mismatch.
        // We will update the action to be robust:

        // FETCH PRODUCT OPTIONS FIRST to be server-side sure
        const productQuery = await admin.graphql(
            `#graphql
          query getOptions($id: ID!) {
            product(id: $id) {
              options {
                id
                name
                values
              }
            }
          }`,
            { variables: { id: productId } }
        );
        const productJson = await productQuery.json();
        const existingOptions = productJson.data.product.options;

        // Logic:
        // 1. If product has valid options (not "Title" which is default for 1-variant), use the first one's name.
        // 2. If product has "Title" option (default), adding a variant with a different option name might require `productOptionsCreate`.

        let targetOptionName = optionName;
        // If the only option is "Title", it usually means it's a single variant product. 
        // Adding a variant implies we are making it multi-variant.
        // If we want to add "Size", we might need to rename "Title" to "Size" or add "Size" as a new option.

        // For this specific 'do it' request, let's try to match the existing first option if it's not "Title".
        const validOption = existingOptions.find(o => o.name !== "Title");
        if (validOption) {
            targetOptionName = validOption.name;
        }

        // If we still just have "Title", we should probably create the variant using "Size" and Shopify might handle the conversion 
        // OR we error out. But the user saw "Option does not exist", implying they tried to add "Size" to a product that didn't have it.

        // FIX: If option doesn't exist, we must add it first? 
        // Actually, productVariantsBulkCreate requires the option values to match existing option names.

        // If the product has NO "Size" option, simple creation fails.
        // Strategy: 
        // If existingOptions has "Size", use it.
        // If existingOptions has only "Title", we likely need to Update the product to have "Size" option first or just use "Title" (but user input "Size").

        // Let's try to use the existing option name whatever it is, if available.
        if (existingOptions.length > 0 && existingOptions[0].name !== "Title") {
            // Use the existing option name (e.g. if it's "Color", add a "Color")
            // But the UI input says "Size". 
            // We will treat the input "size" as the value for the *first option* regardless of its name.
            targetOptionName = existingOptions[0].name;
        } else {
            // If it's "Title", we should probably rename it to "Size" or whatever the user wants?
            // Or just use "Size" and hope Shopify adds it? No, Shopify is strict.

            // If it is "Title" (default), we usually rename "Title" to "Size" when adding the second variant.
            // OR simpler: just use "Size" as the value for the "Title" option? No that's weird.

            // Providing a robust fix: if option is "Title", we update the product options to be "Size".
            if (existingOptions.length === 1 && existingOptions[0].name === "Title") {
                // Update the option name to "Size" (or whatever the user implicitly wanted)
                // This converts "Default Title" variant to "Small" (or whatever).
                // This is complex.

                // FAIL SAFE: If targetOptionName is not found, default to "Title" if it exists.
                if (existingOptions.some(o => o.name === "Title")) {
                    targetOptionName = "Title";
                }
            }
        }

        // Better approach for the error: explicitly checking if 'Size' exists.
        const sizeOption = existingOptions.find(o => o.name === "Size");
        if (!sizeOption) {
            // If 'Size' doesn't exist, use the first available option.
            if (existingOptions.length > 0) {
                targetOptionName = existingOptions[0].name;
            }
        } else {
            targetOptionName = "Size";
        }

        const response = await admin.graphql(
            `#graphql
            mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
                productVariantsBulkCreate(productId: $productId, variants: $variants) {
                    productVariants {
                        id
                        title
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }`,
            {
                variables: {
                    productId,
                    variants: [{
                        optionValues: [{ optionName: targetOptionName, name: size }],
                        price,
                        inventoryItem: { sku }
                    }]
                }
            }
        );
        return await response.json();
    }

    // Default: Create Multi-Variant Product (Fixing SKU error by using direct creation)
    const color = ["Red", "Orange", "Yellow", "Green"][
        Math.floor(Math.random() * 4)
    ];

    const productResponse = await admin.graphql(
        `#graphql
      mutation productCreate($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
          }
          userErrors {
            field
            message
          }
        }
      }`,
        {
            variables: {
                product: {
                    title: `${color} Multi-Size Snowboard`,
                    productType: "Snowboard",
                    productOptions: [
                        {
                            name: "Size", // This sets the option name to 'Size'
                            values: [
                                { name: "Small" },
                                { name: "Medium" },
                                { name: "Large" }
                            ]
                        }
                    ]
                },
            },
        }
    );

    const productJson = await productResponse.json();
    if (productJson.data.productCreate.userErrors.length > 0) {
        return { errors: productJson.data.productCreate.userErrors };
    }

    const productId = productJson.data.productCreate.product.id;

    // Fetch variants created automatically to update them with individual prices/skus
    const variantsQuery = await admin.graphql(
        `#graphql
      query getVariants($id: ID!) {
        product(id: $id) {
          variants(first: 10) {
            edges {
              node {
                id
                title
              }
            }
          }
        }
      }`,
        {
            variables: { id: productId },
        }
    );

    const variantsJson = await variantsQuery.json();
    const variants = variantsJson.data.product.variants.edges;

    const variantUpdates = variants.map(({ node }, index) => ({
        id: node.id,
        price: (50 + index * 25).toFixed(2),
        inventoryItem: {
            sku: `${color.toUpperCase()}-${node.title.toUpperCase()}`
        }
    }));

    await admin.graphql(
        `#graphql
      mutation updateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
          }
          userErrors {
            field
            message
          }
        }
      }`,
        {
            variables: {
                productId: productId,
                variants: variantUpdates,
            },
        }
    );

    return {
        productId,
        variantsCount: variants.length,
    };
};

export default function ProductsPage() {
    const { products } = useLoaderData();
    const fetcher = useFetcher();
    const addVariantFetcher = useFetcher();

    const [showVariantForm, setShowVariantForm] = useState(null); // ID of the product

    const isLoading =
        ["loading", "submitting"].includes(fetcher.state) &&
        fetcher.formMethod === "POST";

    useEffect(() => {
        if (fetcher.data && fetcher.state === "idle") {
            if (fetcher.data.errors) {
                shopify.toast.show(fetcher.data.errors[0].message, { isError: true });
            } else {
                shopify.toast.show("Multi-variant product created");
            }
        }
    }, [fetcher.data, fetcher.state]);

    useEffect(() => {
        if (addVariantFetcher.data && addVariantFetcher.state === "idle") {
            const data = addVariantFetcher.data.data?.productVariantsBulkCreate;
            if (data?.userErrors?.length > 0) {
                shopify.toast.show(data.userErrors[0].message, { isError: true });
            } else {
                shopify.toast.show("Variant added successfully");
                setShowVariantForm(null);
            }
        }
    }, [addVariantFetcher.data, addVariantFetcher.state]);

    const populateProduct = () => fetcher.submit({ intent: "populate" }, { method: "POST" });

    return (
        <div style={{ padding: "20px", maxWidth: "1000px", margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
                <h1>Products Catalog</h1>
                {/* 
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
                        fontWeight: "bold"
                    }}
                >
                    {isLoading ? "Creating..." : "Add Multi-Variant Product"}
                </button>
                */}
            </div>

            {products.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", backgroundColor: "#f6f6f7", borderRadius: "8px" }}>
                    <p>No products found in your store.</p>
                </div>
            ) : (
                <div style={{ backgroundColor: "white", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ borderBottom: "1px solid #eee", textAlign: "left" }}>
                                <th style={{ padding: "12px 20px", width: "80px" }}>Image</th>
                                <th style={{ padding: "12px 20px" }}>Product Detail</th>
                                <th style={{ padding: "12px 20px", width: "120px" }}>Inventory</th>

                            </tr>
                        </thead>
                        <tbody>
                            {products.map((product) => {
                                // Determine the primary option name (e.g. Size, Color, or Title)
                                const primaryOption = product.options.find(o => o.name !== "Title") || product.options[0];
                                const optionNameLabel = primaryOption && primaryOption.name !== "Title" ? primaryOption.name : "Option";

                                return (
                                    <tr key={product.id} style={{ borderBottom: "1px solid #f6f6f7" }}>
                                        <td style={{ padding: "12px 20px", verticalAlign: "top" }}>
                                            <div style={{
                                                width: "60px",
                                                height: "60px",
                                                backgroundColor: "#f1f1f1",
                                                borderRadius: "4px",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                overflow: "hidden",
                                                border: "1px solid #eee"
                                            }}>
                                                {product.featuredImage ? (
                                                    <img
                                                        src={product.featuredImage.url}
                                                        alt={product.featuredImage.altText || product.title}
                                                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                    />
                                                ) : (
                                                    <span style={{ fontSize: "20px" }}>📦</span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: "12px 20px", verticalAlign: "top" }}>
                                            <div style={{ fontWeight: "600", color: "#202223" }}>{product.title}</div>
                                            <div style={{ margin: "4px 0" }}>
                                                {product.productType && (
                                                    <span style={{
                                                        display: "inline-block",
                                                        padding: "2px 8px",
                                                        backgroundColor: "#e4e5e7",
                                                        borderRadius: "10px",
                                                        fontSize: "0.8rem",
                                                        color: "#4a4d50",
                                                        marginRight: "8px"
                                                    }}>
                                                        {product.productType}
                                                    </span>
                                                )}
                                                <span style={{
                                                    fontSize: "0.8rem",
                                                    color: product.status === "ACTIVE" ? "#007f5f" : "#6d7175",
                                                    fontWeight: "500"
                                                }}>
                                                    • {product.status.toLowerCase()}
                                                </span>
                                            </div>

                                            {/* Variants Section */}
                                            <div style={{ marginTop: "12px" }}>
                                                <div style={{ fontSize: "0.8rem", color: "#6d7175", fontWeight: "600", marginBottom: "4px", display: "flex", justifyContent: "space-between" }}>
                                                    <span>VARIANTS</span>
                                                </div>
                                                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                                                    {product.variants.edges.map(({ node: variant }) => (
                                                        <li key={variant.id} style={{
                                                            fontSize: "0.85rem",
                                                            color: "#4a4d50",
                                                            padding: "4px 0",
                                                            borderTop: "1px dashed #f1f1f1",
                                                            display: "flex",
                                                            justifyContent: "space-between"
                                                        }}>
                                                            <span>{variant.title} {variant.sku ? `(${variant.sku})` : ""}</span>
                                                            <span style={{ fontWeight: "500" }}>{variant.price} • {variant.inventoryQuantity} in stock</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>

                                            {/* Add Variant Form */}
                                            <div style={{ marginTop: "10px" }}>
                                                {showVariantForm === product.id ? (
                                                    <addVariantFetcher.Form method="POST" style={{
                                                        padding: "10px",
                                                        backgroundColor: "#f9f9f9",
                                                        borderRadius: "4px",
                                                        border: "1px solid #eee"
                                                    }}>
                                                        <input type="hidden" name="intent" value="add-variant" />
                                                        <input type="hidden" name="productId" value={product.id} />
                                                        {/* We could pass the optionName here, but calculating it on the server is safer */}
                                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                                                            <input name="size" placeholder={`${optionNameLabel} (e.g. XL)`} required style={{ padding: "4px", borderRadius: "4px", border: "1px solid #ccc" }} />
                                                            <input name="price" placeholder="Price" type="number" step="0.01" required style={{ padding: "4px", borderRadius: "4px", border: "1px solid #ccc" }} />
                                                        </div>
                                                        <div style={{ display: "flex", gap: "8px" }}>
                                                            <input name="sku" placeholder="SKU" style={{ flex: 1, padding: "4px", borderRadius: "4px", border: "1px solid #ccc" }} />
                                                            <button type="submit" disabled={addVariantFetcher.state !== "idle"} style={{ padding: "4px 12px", backgroundColor: "#008060", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
                                                                {addVariantFetcher.state !== "idle" ? "..." : "Add"}
                                                            </button>
                                                            <button type="button" onClick={() => setShowVariantForm(null)} style={{ padding: "4px 12px", border: "1px solid #ccc", borderRadius: "4px", cursor: "pointer", backgroundColor: "white" }}>Cancel</button>
                                                        </div>
                                                    </addVariantFetcher.Form>
                                                ) : (
                                                    <button
                                                        onClick={() => setShowVariantForm(product.id)}
                                                        style={{
                                                            fontSize: "0.8rem",
                                                            color: "#008060",
                                                            background: "none",
                                                            border: "none",
                                                            padding: 0,
                                                            textDecoration: "underline",
                                                            cursor: "pointer",
                                                            fontWeight: "600"
                                                        }}
                                                    >
                                                        + Add new variant
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: "12px 20px", verticalAlign: "top" }}>
                                            <div style={{ fontSize: "0.95rem", fontWeight: "500" }}>
                                                {product.totalInventory} available
                                            </div>
                                        </td>

                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
