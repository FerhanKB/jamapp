import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";

export function AuthScreen() {
  const { signup, login } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") await signup(username, password);
      else await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <h1>jamapp</h1>
      <h2>{mode === "login" ? "Log in" : "Sign up"}</h2>
      <form onSubmit={onSubmit}>
        <input
          placeholder="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.currentTarget.value)}
          required
        />
        <input
          type="password"
          placeholder="password (min 8)"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? "..." : mode === "login" ? "Log in" : "Sign up"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <button
        type="button"
        className="link"
        onClick={() => {
          setError(null);
          setMode(mode === "login" ? "signup" : "login");
        }}
      >
        {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
      </button>
    </main>
  );
}
