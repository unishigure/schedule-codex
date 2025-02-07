import { s3, write } from "bun";

const refreshToken = s3.file("refresh_token");

export async function saveRefreshToken(token: string) {
  await write(refreshToken, token);
}

export async function loadRefreshToken() {
  try {
    return await refreshToken.text();
  } catch (e) {
    return null;
  }
}
