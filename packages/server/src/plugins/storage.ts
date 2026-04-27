import type { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  S3Client,
  PutObjectCommand,
  CopyObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ---------------------------------------------------------------------------
// StorageProvider interface
// ---------------------------------------------------------------------------

export interface StorageProvider {
  upload(key: string, body: Readable | Buffer, contentType: string, size: number): Promise<void>;
  copy(sourceKey: string, destKey: string): Promise<void>;
  getSignedUrl(key: string, expiresInSec?: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Fastify module augmentation
// ---------------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyInstance {
    storage: StorageProvider;
  }
}

// ---------------------------------------------------------------------------
// MinioStorage implementation
// ---------------------------------------------------------------------------

const DEFAULT_BUCKET = 'forge-uploads';
const DEFAULT_SIGNED_URL_EXPIRY = 3600; // 1 hour

export class MinioStorage implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(env: Record<string, string>) {
    const endpoint = env['MINIO_ENDPOINT'] ?? 'localhost';
    const port = env['MINIO_PORT'] ?? '9000';
    const accessKey = env['MINIO_ACCESS_KEY'] ?? '';
    const secretKey = env['MINIO_SECRET_KEY'] ?? '';

    this.bucket = env['MINIO_BUCKET'] || DEFAULT_BUCKET;

    this.client = new S3Client({
      endpoint: `http://${endpoint}:${port}`,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async upload(
    key: string,
    body: Readable | Buffer,
    contentType: string,
    size: number,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: size,
      }),
    );
  }

  async copy(sourceKey: string, destKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destKey,
      }),
    );
  }

  async getSignedUrl(key: string, expiresInSec?: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: expiresInSec ?? DEFAULT_SIGNED_URL_EXPIRY,
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface StoragePluginOptions {
  endpoint: string;
  port: string;
  accessKey: string;
  secretKey: string;
  bucket?: string;
}

// ---------------------------------------------------------------------------
// Fastify plugin
// ---------------------------------------------------------------------------

async function storagePluginImpl(
  fastify: FastifyInstance,
  opts: StoragePluginOptions,
): Promise<void> {
  const env: Record<string, string> = {
    MINIO_ENDPOINT: opts.endpoint,
    MINIO_PORT: opts.port,
    MINIO_ACCESS_KEY: opts.accessKey,
    MINIO_SECRET_KEY: opts.secretKey,
    MINIO_BUCKET: opts.bucket ?? DEFAULT_BUCKET,
  };

  const storage = new MinioStorage(env);
  await storage.ensureBucket();

  fastify.decorate('storage', storage);
}

export const storagePlugin = fp(storagePluginImpl, {
  name: 'storage-plugin',
});
