import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET;
const ISS = process.env.JWT_ISS;
const AUD = process.env.JWT_AUD;

function must(v: string | undefined, name: string) {
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export function verifyJwt(token: string) {
  const secret = must(SECRET, "JWT_SECRET");

  const opts: jwt.VerifyOptions = {
    algorithms: ["HS256"],
  };

  if (ISS) opts.issuer = ISS;
  if (AUD) opts.audience = AUD;

  return jwt.verify(token, secret, opts);
}

export function signJwt(
  payload: Record<string, any>,
  options: jwt.SignOptions = {}
) {
  const secret = must(SECRET, "JWT_SECRET");

  const opts: jwt.SignOptions = {
    algorithm: "HS256",
    ...options,
  };

  if (ISS && !opts.issuer) opts.issuer = ISS;
  if (AUD && !opts.audience) opts.audience = AUD;

  return jwt.sign(payload, secret, opts);
}
