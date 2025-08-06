export function Login() {
  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h1>Unauthorized Access</h1>
      <p>
        This application requires authentication through Cloudflare Access.
        Please contact your administrator to gain access.
      </p>
      <p>
        If you believe you should have access, please verify that you're 
        accessing this application through the proper Cloudflare Access domain.
      </p>
    </div>
  );
}
