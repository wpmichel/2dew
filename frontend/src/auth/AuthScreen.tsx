import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";
import { fieldError, fieldErrorsOf, messageOf } from "../util/errors";

type Mode = "login" | "register";

export function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [localErrors, setLocalErrors] = useState<{ email?: string; password?: string }>({});

  function validate(): boolean {
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) errors.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errors.email = "Enter a valid email address.";
    if (!password) errors.password = "Password is required.";
    else if (mode === "register" && password.length < 8)
      errors.password = "Password must be at least 8 characters.";
    setLocalErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setServerErrors({});
    if (!validate()) return;

    setSubmitting(true);
    try {
      const action = mode === "login" ? login : register;
      await action(email.trim(), password);
      // On success the AuthProvider sets the token and App swaps to the task list.
    } catch (err) {
      // Preserve the user's input; only surface the errors.
      setServerErrors(fieldErrorsOf(err));
      setFormError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setFormError(null);
    setServerErrors({});
    setLocalErrors({});
  }

  const emailError = localErrors.email ?? fieldError(serverErrors, "email");
  const passwordError = localErrors.password ?? fieldError(serverErrors, "password");

  return (
    <div className="auth-screen">
      <form className="card auth-card" onSubmit={handleSubmit} noValidate>
        <h1>{mode === "login" ? "Log in" : "Create account"}</h1>

        {formError && (
          <p className="error-banner" role="alert">
            {formError}
          </p>
        )}

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={emailError ? true : undefined}
          />
          {emailError && <span className="field-error">{emailError}</span>}
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={passwordError ? true : undefined}
          />
          {passwordError && <span className="field-error">{passwordError}</span>}
        </label>

        <button type="submit" disabled={submitting}>
          {submitting ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>

        <p className="auth-switch">
          {mode === "login" ? (
            <>
              No account?{" "}
              <button type="button" className="link" onClick={() => switchMode("register")}>
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button type="button" className="link" onClick={() => switchMode("login")}>
                Log in
              </button>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
