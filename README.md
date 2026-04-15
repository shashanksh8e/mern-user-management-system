# User Management System (MERN)

A full-stack MERN application for role-based user management with secure authentication, authorization, audit fields, and CRUD features.

## Tech Stack

- Frontend: React (Vite), Axios
- Backend: Node.js, Express
- Database: MongoDB, Mongoose
- Auth: JWT + bcrypt password hashing

## Features Implemented

- JWT-based login
- Password hashing with bcrypt
- Role-based access control (`admin`, `manager`, `user`)
- Admin capabilities:
  - Create users
  - View paginated/filterable/searchable users
  - Edit users
  - Deactivate users (soft delete via status)
- Manager capabilities:
  - View users
  - Edit non-admin users
- User capabilities:
  - View and update own profile only
- Audit fields:
  - `createdAt`, `updatedAt`
  - `createdBy`, `updatedBy`
- API validation with Zod
- Proper HTTP status responses (`401`, `403`, `404`, `409`, `500`)

## Folder Structure

```text
proo/
├── backend/
│   ├── src/
│   │   └── index.js
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── main.jsx
│   │   └── index.css
│   ├── .env.example
│   └── package.json
└── README.md
```

## Backend Setup

1. Go to backend:
   ```bash
   cd backend
   ```
2. Create env:
   - Copy `.env.example` to `.env`
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start backend:
   ```bash
   npm run dev
   ```

Backend runs at `http://localhost:5000`.

### Backend Environment Variables

- `PORT=5000`
- `MONGODB_URI=mongodb://127.0.0.1:27017/user_management`
- `JWT_SECRET=super_secret_key_change_me`
- `CLIENT_URL=http://localhost:5173`
- `SEED_ADMIN_EMAIL=admin@example.com`
- `SEED_ADMIN_PASSWORD=Admin@123`

## Frontend Setup

1. Go to frontend:
   ```bash
   cd frontend
   ```
2. Create env:
   - Copy `.env.example` to `.env`
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start frontend:
   ```bash
   npm run dev
   ```

Frontend runs at `http://localhost:5173`.

### Frontend Environment Variable

- `VITE_API_BASE_URL=http://localhost:5000/api`

## Default Seed Admin

When backend starts for first time, it creates admin user from env:

- Email: `admin@example.com`
- Password: `Admin@123`

## API Endpoints

### Auth

- `POST /api/auth/login`
- `GET /api/auth/me`

### Users

- `GET /api/users` (admin, manager)
- `GET /api/users/:id` (admin/manager; user can only fetch self)
- `POST /api/users` (admin only)
- `PATCH /api/users/:id` (admin/manager restrictions applied)
- `PATCH /api/users/me` (self profile update)
- `DELETE /api/users/:id` (admin only, soft deactivation)

## Deployment Guide (Quick)

### Backend (Render/Railway)

1. Push repo to GitHub.
2. Create new Web Service from `backend`.
3. Add env vars from backend `.env`.
4. Start command: `npm start`.
5. Note public backend URL.

### Frontend (Vercel/Netlify)

1. Deploy `frontend` folder.
2. Set env `VITE_API_BASE_URL` to deployed backend URL + `/api`.
3. Redeploy frontend.

## Demo Video Checklist (2-3 min)

Show:
1. Login with admin.
2. User list with search/filter/pagination.
3. Create user (show generated password if left blank).
4. Edit user role/status.
5. Deactivate user.
6. Login as regular user and show only profile update access.

## Notes

- Never commit `.env`.
- Password hashes are never returned in API responses.
- Inactive users cannot login.
