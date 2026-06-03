import bcrypt from "bcryptjs";

export async function hashAdminPassword(password) {
  const value = String(password || "");
  if (!value) throw new Error("password is required");
  return bcrypt.hash(value, 10);
}

export async function verifyAdminPassword(inputPassword, configuredPassword) {
  if (!configuredPassword) return false;
  if (configuredPassword.startsWith("$2a$") || configuredPassword.startsWith("$2b$")) {
    return bcrypt.compare(inputPassword || "", configuredPassword);
  }
  return String(inputPassword || "") === configuredPassword;
}

export function requireAdmin(req, res, next) {
  if (req.session?.admin === true) return next();
  return res.status(401).json({ error: "unauthorized" });
}
