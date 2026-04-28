import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Readable } from 'node:stream';
import type { StorageProvider } from '../../plugins/storage.js';

// ---------------------------------------------------------------------------
// Hoisted mock functions (available to vi.mock factories)
// ---------------------------------------------------------------------------
const { sendMock, getSignedUrlMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  getSignedUrlMock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock the entire @aws-sdk/client-s3 module
// ---------------------------------------------------------------------------
vi.mock('@aws-sdk/client-s3', () => {
  const PutObjectCommand = vi.fn();
  const CopyObjectCommand = vi.fn();
  const GetObjectCommand = vi.fn();
  const DeleteObjectCommand = vi.fn();
  const HeadObjectCommand = vi.fn();
  const HeadBucketCommand = vi.fn();
  const CreateBucketCommand = vi.fn();

  const S3Client = vi.fn().mockImplementation(() => ({
    send: sendMock,
  }));

  return {
    S3Client,
    PutObjectCommand,
    CopyObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
    HeadBucketCommand,
    CreateBucketCommand,
  };
});

// ---------------------------------------------------------------------------
// Mock @aws-sdk/s3-request-presigner
// ---------------------------------------------------------------------------
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------
import {
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  CopyObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { MinioStorage } from '../../plugins/storage.js';

function createStorage(overrides: Record<string, string> = {}): MinioStorage {
  const env: Record<string, string> = {
    MINIO_ENDPOINT: 'localhost',
    MINIO_PORT: '9000',
    MINIO_ACCESS_KEY: 'minioadmin',
    MINIO_SECRET_KEY: 'minioadmin',
    MINIO_BUCKET: 'test-bucket',
    ...overrides,
  };
  return new MinioStorage(env);
}

describe('MinioStorage', () => {
  let storage: MinioStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = createStorage();
  });

  // =========================================================================
  // ensureBucket
  // =========================================================================
  describe('ensureBucket', () => {
    it('does nothing when the bucket already exists', async () => {
      sendMock.mockResolvedValueOnce({}); // HeadBucketCommand succeeds

      await storage.ensureBucket();

      expect(HeadBucketCommand).toHaveBeenCalledWith({ Bucket: 'test-bucket' });
      expect(CreateBucketCommand).not.toHaveBeenCalled();
    });

    it('creates the bucket when it does not exist', async () => {
      const notFound = new Error('NotFound');
      Object.assign(notFound, { $metadata: { httpStatusCode: 404 } });
      sendMock.mockRejectedValueOnce(notFound); // HeadBucketCommand fails with 404
      sendMock.mockResolvedValueOnce({}); // CreateBucketCommand succeeds

      await storage.ensureBucket();

      expect(HeadBucketCommand).toHaveBeenCalledWith({ Bucket: 'test-bucket' });
      expect(CreateBucketCommand).toHaveBeenCalledWith({ Bucket: 'test-bucket' });
    });

    it('uses default bucket name when MINIO_BUCKET is not set', async () => {
      const storageDefault = createStorage({ MINIO_BUCKET: '' });
      sendMock.mockResolvedValueOnce({});

      await storageDefault.ensureBucket();

      expect(HeadBucketCommand).toHaveBeenCalledWith({ Bucket: 'forge-uploads' });
    });

    it('rethrows 403 Forbidden errors (auth failure)', async () => {
      const forbiddenError = new Error('Forbidden');
      Object.assign(forbiddenError, { $metadata: { httpStatusCode: 403 } });
      sendMock.mockRejectedValueOnce(forbiddenError);

      await expect(storage.ensureBucket()).rejects.toThrow('Forbidden');
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(CreateBucketCommand).not.toHaveBeenCalled();
    });

    it('rethrows 500 errors (server error)', async () => {
      const serverError = new Error('Internal Server Error');
      Object.assign(serverError, { $metadata: { httpStatusCode: 500 } });
      sendMock.mockRejectedValueOnce(serverError);

      await expect(storage.ensureBucket()).rejects.toThrow('Internal Server Error');
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(CreateBucketCommand).not.toHaveBeenCalled();
    });

    it('rethrows network errors (no $metadata)', async () => {
      const networkError = new Error('ECONNREFUSED');
      sendMock.mockRejectedValueOnce(networkError);

      await expect(storage.ensureBucket()).rejects.toThrow('ECONNREFUSED');
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(CreateBucketCommand).not.toHaveBeenCalled();
    });

    it('creates bucket when error has $metadata with httpStatusCode 404', async () => {
      const notFoundError = new Error('Not Found');
      Object.assign(notFoundError, { $metadata: { httpStatusCode: 404 } });
      sendMock.mockRejectedValueOnce(notFoundError);
      sendMock.mockResolvedValueOnce({});

      await storage.ensureBucket();

      expect(sendMock).toHaveBeenCalledTimes(2);
      expect(CreateBucketCommand).toHaveBeenCalledWith({ Bucket: 'test-bucket' });
    });
  });

  // =========================================================================
  // upload
  // =========================================================================
  describe('upload', () => {
    it('sends a PutObjectCommand with the correct params', async () => {
      sendMock.mockResolvedValueOnce({});

      const body = Buffer.from('file-content');
      await storage.upload('path/to/file.txt', body, 'text/plain', 12);

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'path/to/file.txt',
        Body: body,
        ContentType: 'text/plain',
        ContentLength: 12,
      });
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it('accepts a Readable stream as body', async () => {
      sendMock.mockResolvedValueOnce({});

      const fakeStream = { pipe: vi.fn() } as unknown as Readable;
      await storage.upload('stream-file.bin', fakeStream, 'application/octet-stream', 1024);

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'stream-file.bin',
        Body: fakeStream,
        ContentType: 'application/octet-stream',
        ContentLength: 1024,
      });
    });
  });

  // =========================================================================
  // copy
  // =========================================================================
  describe('copy', () => {
    it('sends a CopyObjectCommand with the correct params', async () => {
      sendMock.mockResolvedValueOnce({});

      await storage.copy('source/key.txt', 'dest/key.txt');

      expect(CopyObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        CopySource: 'test-bucket/source/key.txt',
        Key: 'dest/key.txt',
      });
      expect(sendMock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // getSignedUrl
  // =========================================================================
  describe('getSignedUrl', () => {
    it('returns a presigned URL with default expiry', async () => {
      getSignedUrlMock.mockResolvedValueOnce('https://signed-url.example.com/file');

      const url = await storage.getSignedUrl('my/file.txt');

      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'my/file.txt',
      });
      expect(getSignedUrlMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Object),
        { expiresIn: 3600 },
      );
      expect(url).toBe('https://signed-url.example.com/file');
    });

    it('accepts a custom expiry in seconds', async () => {
      getSignedUrlMock.mockResolvedValueOnce('https://custom.example.com');

      await storage.getSignedUrl('another/file.txt', 600);

      expect(getSignedUrlMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Object),
        { expiresIn: 600 },
      );
    });
  });

  // =========================================================================
  // delete
  // =========================================================================
  describe('delete', () => {
    it('sends a DeleteObjectCommand with the correct params', async () => {
      sendMock.mockResolvedValueOnce({});

      await storage.delete('path/to/delete.txt');

      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'path/to/delete.txt',
      });
      expect(sendMock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // exists
  // =========================================================================
  describe('exists', () => {
    it('returns true when HeadObjectCommand succeeds', async () => {
      sendMock.mockResolvedValueOnce({});

      const result = await storage.exists('existing-file.txt');

      expect(HeadObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'existing-file.txt',
      });
      expect(result).toBe(true);
    });

    it('returns false when HeadObjectCommand throws', async () => {
      sendMock.mockRejectedValueOnce(new Error('NotFound'));

      const result = await storage.exists('missing-file.txt');

      expect(HeadObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'missing-file.txt',
      });
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // Constructor defaults (lines 50-53 — env vars missing)
  // =========================================================================
  describe('constructor defaults', () => {
    it('uses default values when env vars are missing', () => {
      // Passing an empty env object exercises the ?? fallback on every env key
      const storageDefaults = new MinioStorage({});
      // The storage should be created without throwing
      expect(storageDefaults).toBeInstanceOf(MinioStorage);
    });

    it('falls back to defaults for endpoint and port when not provided', async () => {
      const storagePartial = new MinioStorage({ MINIO_ACCESS_KEY: 'ak', MINIO_SECRET_KEY: 'sk' });
      sendMock.mockResolvedValueOnce({});
      await storagePartial.ensureBucket();
      // Verifies the object was created with defaults (won't throw)
      expect(HeadBucketCommand).toHaveBeenCalledWith({ Bucket: 'forge-uploads' });
    });
  });

  // =========================================================================
  // StorageProvider interface conformance
  // =========================================================================
  describe('interface conformance', () => {
    it('implements StorageProvider', () => {
      // Compile-time check: if MinioStorage doesn't implement StorageProvider,
      // this assignment will produce a TypeScript error.
      const provider: StorageProvider = storage;
      expect(provider).toBeDefined();
      expect(typeof provider.upload).toBe('function');
      expect(typeof provider.copy).toBe('function');
      expect(typeof provider.getSignedUrl).toBe('function');
      expect(typeof provider.delete).toBe('function');
      expect(typeof provider.exists).toBe('function');
    });
  });
});

// ===========================================================================
// storagePlugin integration
// ===========================================================================
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { storagePlugin } from '../../plugins/storage.js';

describe('storagePlugin', () => {
  it('decorates the fastify instance with storage', async () => {
    // Ensure ensureBucket succeeds
    sendMock.mockResolvedValueOnce({});

    const app: FastifyInstance = Fastify({ logger: false });

    await app.register(storagePlugin, {
      endpoint: 'localhost',
      port: '9000',
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
      bucket: 'test-bucket',
    });

    await app.ready();

    expect(app.storage).toBeDefined();
    expect(typeof app.storage.upload).toBe('function');
    expect(typeof app.storage.copy).toBe('function');
    expect(typeof app.storage.getSignedUrl).toBe('function');
    expect(typeof app.storage.delete).toBe('function');
    expect(typeof app.storage.exists).toBe('function');

    await app.close();
  });

  it('uses default bucket when bucket option is omitted (opts.bucket ?? DEFAULT_BUCKET branch)', async () => {
    sendMock.mockResolvedValueOnce({}); // ensureBucket HeadBucketCommand succeeds

    const app: FastifyInstance = Fastify({ logger: false });

    await app.register(storagePlugin, {
      endpoint: 'localhost',
      port: '9000',
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
      // bucket intentionally omitted — exercises opts.bucket ?? DEFAULT_BUCKET
    });

    await app.ready();

    // ensureBucket should have been called with the default bucket name
    expect(HeadBucketCommand).toHaveBeenCalledWith({ Bucket: 'forge-uploads' });
    expect(app.storage).toBeDefined();

    await app.close();
  });
});
