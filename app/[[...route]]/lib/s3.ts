import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";

const client = new S3Client({
  region: "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
});

const TOKEN_FILE_NAME = "refresh_token";

export async function saveRefreshToken(token: string) {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: TOKEN_FILE_NAME,
    Body: token,
  });
  await client.send(command);
}

export async function loadRefreshToken() {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: TOKEN_FILE_NAME,
    });
    const response = await client.send(command);
    const stream = response.Body as Readable;
    const chunks: Uint8Array[] = [];
    for await (let chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf-8");
  } catch (e) {
    return undefined;
  }
}
