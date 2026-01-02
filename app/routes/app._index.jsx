import { Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <div style={{
      padding: "40px",
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "50vh"
    }}>
      <h1 style={{ fontSize: "4rem", marginBottom: "20px" }}>Hello World 👋😃</h1>
      <p style={{ fontSize: "1.5rem", color: "#666", marginBottom: "30px" }}>
        Welcome to your Shopify App!
      </p>

      <Link
        to="/app/products"
        style={{
          padding: "15px 30px",
          backgroundColor: "#008060",
          color: "white",
          textDecoration: "none",
          borderRadius: "8px",
          fontSize: "1.2rem",
          fontWeight: "bold",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
          transition: "transform 0.2s"
        }}
        onMouseOver={(e) => e.currentTarget.style.transform = "scale(1.05)"}
        onMouseOut={(e) => e.currentTarget.style.transform = "scale(1)"}
      >
        Go to Products page
      </Link>
    </div>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
