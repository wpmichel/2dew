import { useAuth } from "./auth/AuthContext";
import { AuthScreen } from "./auth/AuthScreen";
import { TasksPage } from "./tasks/TasksPage";

export default function App() {
  const { token, email, logout } = useAuth();

  if (!token) return <AuthScreen />;

  return (
    <div className="app">
      <header className="app-header">
        <h1>My Tasks</h1>
        <div className="app-header-user">
          <span>{email}</span>
          <button type="button" className="link" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <TasksPage />
    </div>
  );
}
