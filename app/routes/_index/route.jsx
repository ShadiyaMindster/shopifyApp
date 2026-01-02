import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function Login() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1>Welcome to Shadiya App</h1>

        {showForm && (
          <Form method="post" action="/auth/login">
            <input type="text" name="shop" placeholder="myshop.myshopify.com" />
            <button type="submit">Log in</button>
          </Form>
        )}
      </div>
    </div>
  );
}
