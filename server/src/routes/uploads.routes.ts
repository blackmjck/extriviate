import { FastifyPluginAsync } from 'fastify';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { requireAuth } from '../hooks/auth.hook.js';
import { config } from '../config.js';
import type { PaginationParams } from '@extriviate/shared';
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from '@extriviate/shared';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

const uploadsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/uploads/presign
  // Returns a presigned URL for the client to upload directly to R2.
  fastify.post<{ Body: { mimeType: string; fileName: string } }>(
    '/presign',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          required: ['mimeType', 'fileName'],
          properties: {
            mimeType: { type: 'string' },
            fileName: { type: 'string', minLength: 1 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { mimeType, fileName } = request.body;

      if (!ALLOWED_UPLOAD_TYPES.includes(mimeType as any)) {
        return reply.status(400).send({
          success: false,
          error: { message: `Unsupported file type: ${mimeType}`, code: 'INVALID_MIME_TYPE' },
        });
      }

      // Generate a unique key: users/{userId}/{uuid}.{ext}
      const ext = fileName.split('.').pop() ?? '';
      const key = `users/${request.user.sub}/${randomUUID()}.${ext}`;

      const command = new PutObjectCommand({
        Bucket: config.r2.bucketName,
        Key: key,
        ContentType: mimeType,
      });

      const url = await getSignedUrl(s3, command, { expiresIn: 600 }); // 10 minutes

      return reply.send({
        success: true,
        data: { url, key },
      });
    }
  );

  // POST /api/uploads/confirm
  // Called after client uploads to R2. Records the upload in the database.
  fastify.post<{ Body: { key: string; mimeType: string; sizeBytes: number } }>(
    '/confirm',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          required: ['key', 'mimeType', 'sizeBytes'],
          properties: {
            key: { type: 'string', minLength: 1 },
            mimeType: { type: 'string' },
            sizeBytes: { type: 'integer', minimum: 1 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { key, mimeType, sizeBytes } = request.body;

      // Ensure the key belongs to this user (path starts with users/{userId}/)
      if (!key.startsWith(`users/${request.user.sub}/`)) {
        return reply.status(403).send({
          success: false,
          error: { message: 'Upload key does not belong to this user', code: 'FORBIDDEN' },
        });
      }

      // Validate size against type-specific limits
      const isVideo = mimeType.startsWith('video/');
      const maxSize = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;
      if (sizeBytes > maxSize) {
        return reply.status(400).send({
          success: false,
          error: { message: 'File exceeds maximum size', code: 'FILE_TOO_LARGE' },
        });
      }

      const publicUrl = `${config.r2.publicBaseUrl}/${key}`;

      try {
        const result = await fastify.db.query(
          `INSERT INTO uploads (owner_id, key, public_url, mime_type, size_bytes)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, key, public_url, mime_type, size_bytes, created_at`,
          [request.user.sub, key, publicUrl, mimeType, sizeBytes]
        );

        const row = result.rows[0];
        return reply.status(201).send({
          success: true,
          data: {
            upload: {
              id: row.id,
              ownerId: parseInt(request.user.sub, 10),
              key: row.key,
              publicUrl: row.public_url,
              mimeType: row.mime_type,
              sizeBytes: row.size_bytes,
              createdAt: row.created_at,
            },
            publicUrl: row.public_url,
          },
        });
      } catch (err: any) {
        if (err.code === '23505') {
          return reply.status(409).send({
            success: false,
            error: { message: 'This file has already been confirmed', code: 'DUPLICATE_UPLOAD' },
          });
        }
        throw err;
      }
    }
  );

  // GET /api/uploads
  // Lists uploads belonging to the authenticated user.
  fastify.get<{ Querystring: PaginationParams }>(
    '/',
    {
      preHandler: [requireAuth],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const { limit = 20, offset = 0 } = request.query;

      const [items, count] = await Promise.all([
        fastify.db.query(
          `SELECT id, key, public_url, mime_type, size_bytes, created_at
           FROM uploads
           WHERE owner_id = $1
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3`,
          [request.user.sub, limit, offset]
        ),
        fastify.db.query('SELECT COUNT(*) FROM uploads WHERE owner_id = $1', [
          request.user.sub,
        ]),
      ]);

      const uploads = items.rows.map((row: any) => ({
        id: row.id,
        ownerId: parseInt(request.user.sub, 10),
        key: row.key,
        publicUrl: row.public_url,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        createdAt: row.created_at,
      }));

      return reply.send({
        success: true,
        data: {
          items: uploads,
          total: parseInt(count.rows[0].count, 10),
          limit,
          offset,
        },
      });
    }
  );

  // DELETE /api/uploads/:id
  // Deletes the upload record and the object from R2.
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const result = await fastify.db.query(
        'SELECT id, key FROM uploads WHERE id = $1 AND owner_id = $2',
        [request.params.id, request.user.sub]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: { message: 'Upload not found', code: 'NOT_FOUND' },
        });
      }

      const { key } = result.rows[0];

      // Delete from R2 first — if this fails, the DB record stays
      // and the user can retry. Better than orphaning an R2 object.
      await s3.send(
        new DeleteObjectCommand({
          Bucket: config.r2.bucketName,
          Key: key,
        })
      );

      await fastify.db.query('DELETE FROM uploads WHERE id = $1', [request.params.id]);

      return reply.send({ success: true, data: null });
    }
  );
};

export default uploadsRoutes;
