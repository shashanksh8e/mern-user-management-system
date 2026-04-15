const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const dotenv = require("dotenv");
const { z } = require("zod");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const DEFAULT_ORIGINS = ["http://localhost:5173", "http://localhost:5174"];
const CORS_ORIGINS = Array.from(new Set([CLIENT_URL, ...DEFAULT_ORIGINS, ...ALLOWED_ORIGINS]));
const DEV_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const JWT_SECRET = process.env.JWT_SECRET || "replace_me";

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server or tool-based calls with no Origin header.
      if (!origin) return callback(null, true);
      if (DEV_ORIGIN_REGEX.test(origin)) return callback(null, true);
      if (CORS_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json());

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ["admin", "manager", "user"], default: "user" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    _id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    status: this.status,
    createdBy: this.createdBy,
    updatedBy: this.updatedBy,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const User = mongoose.model("User", userSchema);

const asyncHandler =
  (handler) =>
  async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };

const authMiddleware = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication token missing" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: "Invalid token user" });
    }
    if (user.status !== "active") {
      return res.status(403).json({ message: "Account is inactive" });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
});

const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden: insufficient permissions" });
  }
  next();
};

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(["admin", "manager", "user"]).optional().default("user"),
  status: z.enum(["active", "inactive"]).optional().default("active"),
  password: z.string().min(6).optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(["admin", "manager", "user"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  password: z.string().min(6).optional(),
});

const updateSelfSchema = z.object({
  name: z.string().min(2).optional(),
  password: z.string().min(6).optional(),
});

const listUsersQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),
  search: z.string().optional().default(""),
  role: z.enum(["admin", "manager", "user"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

const generateToken = (userId) => jwt.sign({ userId }, JWT_SECRET, { expiresIn: "1d" });
const randomPassword = () => Math.random().toString(36).slice(-10) + "Aa1!";

const parseBody = (schema, body) => schema.safeParse(body);

app.get("/api/health", (_, res) => {
  res.json({ ok: true, service: "user-management-api" });
});

app.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
    const parsed = parseBody(loginSchema, req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid login payload" });
    }

    const { email, password } = parsed.data;
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    if (user.status !== "active") {
      return res.status(403).json({ message: "Account is inactive. Contact admin." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = generateToken(user._id);
    return res.json({ token, user: user.toSafeObject() });
  })
);

app.get(
  "/api/auth/me",
  authMiddleware,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user.toSafeObject() });
  })
);

app.get(
  "/api/users",
  authMiddleware,
  authorize("admin", "manager"),
  asyncHandler(async (req, res) => {
    const parsed = listUsersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid query parameters" });
    }

    const { page, limit, search, role, status } = parsed.data;
    const filter = {};

    if (role) filter.role = role;
    if (status) filter.status = status;
    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [{ name: { $regex: safeSearch, $options: "i" } }, { email: { $regex: safeSearch, $options: "i" } }];
    }

    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find(filter)
        .populate("createdBy", "name email role")
        .populate("updatedBy", "name email role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({
      users: users.map((u) => u.toSafeObject()),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

app.get(
  "/api/users/me",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const self = await User.findById(req.user._id).populate("createdBy", "name email role").populate("updatedBy", "name email role");
    if (!self) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json({ user: self.toSafeObject() });
  })
);

app.get(
  "/api/users/:id",
  authMiddleware,
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    const target = await User.findById(req.params.id).populate("createdBy", "name email role").populate("updatedBy", "name email role");
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    if (req.user.role === "user" && String(req.user._id) !== String(target._id)) {
      return res.status(403).json({ message: "Users can only view their own profile" });
    }
    if (req.user.role === "manager" && target.role === "admin") {
      return res.status(403).json({ message: "Managers cannot access admin user details" });
    }

    res.json({ user: target.toSafeObject() });
  })
);

app.post(
  "/api/users",
  authMiddleware,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid user payload", errors: parsed.error.flatten() });
    }

    const { name, email, role, status } = parsed.data;
    const plainPassword = parsed.data.password || randomPassword();

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    const user = await User.create({
      name,
      email,
      role,
      status,
      password: hashedPassword,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    return res.status(201).json({
      message: "User created",
      generatedPassword: parsed.data.password ? undefined : plainPassword,
      user: user.toSafeObject(),
    });
  })
);

app.patch(
  "/api/users/:id",
  authMiddleware,
  asyncHandler(async (req, res) => {
    if (req.params.id === "me") {
      const parsedSelf = updateSelfSchema.safeParse(req.body);
      if (!parsedSelf.success) {
        return res.status(400).json({ message: "Invalid profile payload", errors: parsedSelf.error.flatten() });
      }
      if (!parsedSelf.data.name && !parsedSelf.data.password) {
        return res.status(400).json({ message: "No update fields sent" });
      }

      const self = await User.findById(req.user._id).select("+password");
      if (!self) {
        return res.status(404).json({ message: "User not found" });
      }

      if (parsedSelf.data.name) self.name = parsedSelf.data.name;
      if (parsedSelf.data.password) self.password = await bcrypt.hash(parsedSelf.data.password, 10);
      self.updatedBy = req.user._id;
      await self.save();

      return res.json({ message: "Profile updated", user: self.toSafeObject() });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid update payload", errors: parsed.error.flatten() });
    }

    const target = await User.findById(req.params.id).select("+password");
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    const isSelf = String(req.user._id) === String(target._id);

    if (req.user.role === "user") {
      return res.status(403).json({ message: "Only admin and manager can update arbitrary users" });
    }
    if (req.user.role === "manager" && (target.role === "admin" || parsed.data.role === "admin")) {
      return res.status(403).json({ message: "Managers cannot modify admin users or assign admin role" });
    }
    if (req.user.role === "manager" && isSelf && parsed.data.role) {
      return res.status(403).json({ message: "Managers cannot change their own role" });
    }

    if (parsed.data.email && parsed.data.email !== target.email) {
      const exists = await User.findOne({ email: parsed.data.email });
      if (exists) {
        return res.status(409).json({ message: "Email already in use" });
      }
      target.email = parsed.data.email;
    }
    if (parsed.data.name) target.name = parsed.data.name;
    if (parsed.data.role) target.role = parsed.data.role;
    if (parsed.data.status) target.status = parsed.data.status;
    if (parsed.data.password) target.password = await bcrypt.hash(parsed.data.password, 10);

    target.updatedBy = req.user._id;
    await target.save();

    return res.json({ message: "User updated", user: target.toSafeObject() });
  })
);

app.patch(
  "/api/users/me",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const parsed = updateSelfSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid profile payload", errors: parsed.error.flatten() });
    }
    if (!parsed.data.name && !parsed.data.password) {
      return res.status(400).json({ message: "No update fields sent" });
    }

    const self = await User.findById(req.user._id).select("+password");
    if (!self) {
      return res.status(404).json({ message: "User not found" });
    }

    if (parsed.data.name) self.name = parsed.data.name;
    if (parsed.data.password) self.password = await bcrypt.hash(parsed.data.password, 10);
    self.updatedBy = req.user._id;
    await self.save();

    return res.json({ message: "Profile updated", user: self.toSafeObject() });
  })
);

app.delete(
  "/api/users/:id",
  authMiddleware,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    const target = await User.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }
    if (String(target._id) === String(req.user._id)) {
      return res.status(400).json({ message: "Admin cannot deactivate self" });
    }

    target.status = "inactive";
    target.updatedBy = req.user._id;
    await target.save();

    res.json({ message: "User deactivated successfully" });
  })
);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "Internal server error" });
});

const bootstrap = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const seedAdminEmail = process.env.SEED_ADMIN_EMAIL || "admin@example.com";
  const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@123";

  const existing = await User.findOne({ email: seedAdminEmail });
  if (!existing) {
    const password = await bcrypt.hash(seedAdminPassword, 10);
    await User.create({
      name: "System Admin",
      email: seedAdminEmail,
      password,
      role: "admin",
      status: "active",
    });
    console.log(`Seed admin created: ${seedAdminEmail}`);
  }

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
};

bootstrap().catch((error) => {
  console.error("Startup failed", error);
  process.exit(1);
});
