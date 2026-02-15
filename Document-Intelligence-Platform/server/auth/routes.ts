import type { Express } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models";
import { signToken, isAuthenticated } from "./jwt";
import { z } from "zod";

const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["admin", "reviewer", "user"]).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const body = signupSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({ message: "Invalid input", errors: body.error.flatten() });
      }
      const { name, email, password, role } = body.data;
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await User.create({
        name,
        email,
        passwordHash,
        role: role || "user",
      });
      const token = signToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      });
      return res.status(201).json({
        token,
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      console.error("Signup error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const body = loginSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({ message: "Invalid email or password" });
      }
      const { email, password } = body.data;
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      const token = signToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      });
      return res.json({
        token,
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const user = await User.findById(req.user.userId).select("-passwordHash");
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      return res.json({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      });
    } catch (err) {
      console.error("Get user error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
}
