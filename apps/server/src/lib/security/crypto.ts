import jwt from "jsonwebtoken";

const PUB = process.env.JWT_PUBLIC_KEY!;
const ISS = process.env.JWT_ISS!;
const AUD = process.env.JWT_AUD!;

export function verifyJwt(token: string) {
  return jwt.verify(token, PUB, { algorithms: ["RS256"], issuer: ISS, audience: AUD });
}
