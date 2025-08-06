import { route } from "rwsdk/router";
import { Login } from "./Login";

export const userRoutes = [
  route("/login", [Login]),
  route("/logout", async function () {
    // With JWT auth, logout is handled by Cloudflare Access
    return new Response(null, {
      status: 302,
      headers: { Location: "/" },
    });
  }),
];
