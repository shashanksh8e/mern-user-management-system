import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const api = axios.create({ baseURL: API_BASE_URL });

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1, limit: 10 });
  const [filters, setFilters] = useState({ search: "", role: "", status: "" });
  const [loginForm, setLoginForm] = useState({ email: "admin@example.com", password: "Admin@123" });
  const [newUserForm, setNewUserForm] = useState({ name: "", email: "", role: "user", status: "active", password: "" });
  const [profileForm, setProfileForm] = useState({ name: "", password: "" });
  const [editUserId, setEditUserId] = useState("");
  const [editUserForm, setEditUserForm] = useState({ name: "", email: "", role: "user", status: "active", password: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const canManageUsers = user && (user.role === "admin" || user.role === "manager");

  const clearNotices = () => {
    setMessage("");
    setError("");
  };

  const handleApiError = (err, fallback = "Something went wrong") => {
    const apiMessage = err?.response?.data?.message;
    const fieldErrors = err?.response?.data?.errors?.fieldErrors;
    const firstFieldError = fieldErrors
      ? Object.values(fieldErrors).flat().find(Boolean)
      : "";
    setError(firstFieldError || apiMessage || fallback);
  };

  const loadMe = async () => {
    if (!token) return;
    try {
      const { data } = await api.get("/auth/me", { headers: authHeaders });
      setUser(data.user);
      setProfileForm({ name: data.user.name, password: "" });
    } catch (err) {
      setToken("");
      localStorage.removeItem("token");
      setUser(null);
      handleApiError(err, "Session expired. Please login again.");
    }
  };

  const loadUsers = async (targetPage = 1) => {
    if (!token || !canManageUsers) return;
    try {
      setLoading(true);
      const params = {
        page: targetPage,
        limit: pagination.limit,
        ...(filters.search ? { search: filters.search } : {}),
        ...(filters.role ? { role: filters.role } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      };
      const { data } = await api.get("/users", { params, headers: authHeaders });
      setUsers(data.users);
      setPagination(data.pagination);
    } catch (err) {
      handleApiError(err, "Could not load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (canManageUsers) loadUsers(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageUsers]);

  const handleLogin = async (e) => {
    e.preventDefault();
    clearNotices();
    try {
      const { data } = await api.post("/auth/login", loginForm);
      localStorage.setItem("token", data.token);
      setToken(data.token);
      setUser(data.user);
      setMessage("Login successful");
    } catch (err) {
      handleApiError(err, "Login failed");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setToken("");
    setUser(null);
    setUsers([]);
    setMessage("Logged out");
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    clearNotices();
    try {
      const payload = {
        name: newUserForm.name.trim(),
        email: newUserForm.email.trim().toLowerCase(),
        role: newUserForm.role || "user",
        status: newUserForm.status || "active",
        password: newUserForm.password,
      };

      if (payload.name.length < 2) {
        setError("Name must be at least 2 characters");
        return;
      }

      if (!payload.password) delete payload.password;
      const { data } = await api.post("/users", payload, { headers: authHeaders });
      setMessage(data.generatedPassword ? `User created. Generated password: ${data.generatedPassword}` : "User created successfully");
      setNewUserForm({ name: "", email: "", role: "user", status: "active", password: "" });
      await loadUsers(1);
    } catch (err) {
      handleApiError(err, "Failed to create user");
    }
  };

  const startEditUser = (selectedUser) => {
    setEditUserId(selectedUser._id);
    setEditUserForm({
      name: selectedUser.name,
      email: selectedUser.email,
      role: selectedUser.role,
      status: selectedUser.status,
      password: "",
    });
  };

  const submitEditUser = async (e) => {
    e.preventDefault();
    clearNotices();
    try {
      const payload = { ...editUserForm };
      if (!payload.password) delete payload.password;
      await api.patch(`/users/${editUserId}`, payload, { headers: authHeaders });
      setMessage("User updated");
      setEditUserId("");
      await loadUsers(pagination.page);
    } catch (err) {
      handleApiError(err, "Failed to update user");
    }
  };

  const deactivateUser = async (id) => {
    clearNotices();
    try {
      await api.delete(`/users/${id}`, { headers: authHeaders });
      setMessage("User deactivated");
      await loadUsers(pagination.page);
    } catch (err) {
      handleApiError(err, "Failed to deactivate user");
    }
  };

  const updateMyProfile = async (e) => {
    e.preventDefault();
    clearNotices();
    try {
      const payload = {};
      if (profileForm.name) payload.name = profileForm.name;
      if (profileForm.password) payload.password = profileForm.password;
      await api.patch("/users/me", payload, { headers: authHeaders });
      await loadMe();
      setProfileForm((prev) => ({ ...prev, password: "" }));
      setMessage("Profile updated");
    } catch (err) {
      handleApiError(err, "Failed to update profile");
    }
  };

  if (!token || !user) {
    return (
      <main className="container">
        <section className="hero-card">
          <div>
            <h1>User Management System</h1>
            <p className="hero-subtitle">Secure RBAC dashboard for admin, manager and users</p>
          </div>
          <span className="badge badge-info">MERN + JWT</span>
        </section>

        <section className="card">
          <h2>Welcome Back</h2>
          <p className="muted">Login to continue</p>
          <form onSubmit={handleLogin} className="grid">
            <label>
              Email
              <input value={loginForm.email} onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))} required />
            </label>
            <label>
              Password
              <input type="password" value={loginForm.password} onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))} required />
            </label>
            <button type="submit">Login</button>
          </form>
          {error && <p className="error">{error}</p>}
          {message && <p className="success">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="hero-card">
        <div className="header-row">
          <div>
            <h1>User Management Dashboard</h1>
            <p className="muted">
              Logged in as <strong>{user.name}</strong> ({user.role})
            </p>
          </div>
          <div className="actions">
            <span className={`badge role-${user.role}`}>{user.role.toUpperCase()}</span>
            <button onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </header>

      {error && <p className="error card">{error}</p>}
      {message && <p className="success card">{message}</p>}

      <section className="card">
        <h2>My Profile</h2>
        <form onSubmit={updateMyProfile} className="grid two-col">
          <label>
            Name
            <input value={profileForm.name} onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))} />
          </label>
          <label>
            New Password
            <input type="password" value={profileForm.password} onChange={(e) => setProfileForm((p) => ({ ...p, password: e.target.value }))} />
          </label>
          <button type="submit">Update My Profile</button>
        </form>
      </section>

      {canManageUsers && (
        <section className="card">
          <h2>User List</h2>
          <div className="filter-row">
            <input placeholder="Search by name/email" value={filters.search} onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} />
            <select value={filters.role} onChange={(e) => setFilters((p) => ({ ...p, role: e.target.value }))}>
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="user">User</option>
            </select>
            <select value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button onClick={() => loadUsers(1)}>Apply Filters</button>
          </div>

          {loading ? (
            <p>Loading users...</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Audit</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`badge role-${u.role}`}>{u.role}</span>
                    </td>
                    <td>
                      <span className={`badge status-${u.status}`}>{u.status}</span>
                    </td>
                    <td>
                      <small>
                        Created: {new Date(u.createdAt).toLocaleString()}
                        <br />
                        Updated: {new Date(u.updatedAt).toLocaleString()}
                      </small>
                    </td>
                    <td className="actions">
                      <button onClick={() => startEditUser(u)}>Edit</button>
                      {user.role === "admin" && u.status === "active" && u._id !== user._id && (
                        <button className="danger" onClick={() => deactivateUser(u._id)}>
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="header-row">
            <span>
              Page {pagination.page} / {pagination.totalPages || 1} (Total: {pagination.total})
            </span>
            <div className="actions">
              <button disabled={pagination.page <= 1} onClick={() => loadUsers(pagination.page - 1)}>
                Prev
              </button>
              <button disabled={pagination.page >= pagination.totalPages} onClick={() => loadUsers(pagination.page + 1)}>
                Next
              </button>
            </div>
          </div>
        </section>
      )}

      {user.role === "admin" && (
        <section className="card">
          <h2>Create User</h2>
          <form onSubmit={handleCreateUser} className="grid two-col">
            <label>
              Name
              <input value={newUserForm.name} onChange={(e) => setNewUserForm((p) => ({ ...p, name: e.target.value }))} required />
            </label>
            <label>
              Email
              <input type="email" value={newUserForm.email} onChange={(e) => setNewUserForm((p) => ({ ...p, email: e.target.value }))} required />
            </label>
            <label>
              Role
              <select value={newUserForm.role} onChange={(e) => setNewUserForm((p) => ({ ...p, role: e.target.value }))}>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="user">User</option>
              </select>
            </label>
            <label>
              Status
              <select value={newUserForm.status} onChange={(e) => setNewUserForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="span-2">
              Password (optional, leave blank for auto-generated password)
              <input type="password" value={newUserForm.password} onChange={(e) => setNewUserForm((p) => ({ ...p, password: e.target.value }))} />
            </label>
            <button type="submit">Create User</button>
          </form>
        </section>
      )}

      {editUserId && (
        <section className="card">
          <h2>Edit User</h2>
          <form onSubmit={submitEditUser} className="grid two-col">
            <label>
              Name
              <input value={editUserForm.name} onChange={(e) => setEditUserForm((p) => ({ ...p, name: e.target.value }))} />
            </label>
            <label>
              Email
              <input value={editUserForm.email} onChange={(e) => setEditUserForm((p) => ({ ...p, email: e.target.value }))} />
            </label>
            <label>
              Role
              <select value={editUserForm.role} onChange={(e) => setEditUserForm((p) => ({ ...p, role: e.target.value }))}>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="user">User</option>
              </select>
            </label>
            <label>
              Status
              <select value={editUserForm.status} onChange={(e) => setEditUserForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="span-2">
              New Password (optional)
              <input type="password" value={editUserForm.password} onChange={(e) => setEditUserForm((p) => ({ ...p, password: e.target.value }))} />
            </label>
            <div className="actions">
              <button type="submit">Save</button>
              <button type="button" onClick={() => setEditUserId("")}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}

export default App;
