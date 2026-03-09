/**
 * Standalone R2 connection test.
 * Run with: npm run test:r2  (from the server directory)
 *
 * Tests: bucket access, upload, content verification, delete.
 * Leaves no objects behind on success.
 */
import 'dotenv/config';
import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { config } from '../src/config.js';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

const TEST_KEY = 'test/connection-check.txt';
const TEST_BODY = `R2 connection test — ${new Date().toISOString()}`;

async function run(): Promise<void> {
  console.log('R2 Connection Test');
  console.log('==================');
  console.log(`Endpoint : https://${config.r2.accountId}.r2.cloudflarestorage.com`);
  console.log(`Bucket   : ${config.r2.bucketName}`);
  console.log(`Public   : ${config.r2.publicBaseUrl}`);
  console.log('');

  // 1. Verify bucket exists and credentials are valid
  process.stdout.write('1. Checking bucket access ... ');
  await s3.send(new HeadBucketCommand({ Bucket: config.r2.bucketName }));
  console.log('OK');

  // 2. Upload a small test object
  process.stdout.write('2. Uploading test object    ... ');
  await s3.send(
    new PutObjectCommand({
      Bucket: config.r2.bucketName,
      Key: TEST_KEY,
      Body: TEST_BODY,
      ContentType: 'text/plain',
    })
  );
  console.log(`OK  (key: ${TEST_KEY})`);

  // 3. Retrieve and verify the object (via API)
  process.stdout.write('3. Downloading test object via API  ... ');
  const getResult = await s3.send(
    new GetObjectCommand({ Bucket: config.r2.bucketName, Key: TEST_KEY })
  );
  const downloaded = await getResult.Body!.transformToString();
  if (downloaded !== TEST_BODY) {
    throw new Error(`Content mismatch.\n  Expected: ${TEST_BODY}\n  Got     : ${downloaded}`);
  }
  console.log('OK  (content verified)');

  // 4. Retrieve and verify the object (from public URL)
  process.stdout.write('4. Downloading test object via public URL ... ');
  const publicUrl = `${config.r2.publicBaseUrl}/${TEST_KEY}`;
  const response = await fetch(publicUrl);
  if (!response.ok) {
    throw new Error(`Public URL fetch failed: ${response.status} ${response.statusText} (${publicUrl})`);
  }
  const publicBody = await response.text();
  if (publicBody !== TEST_BODY) {
    throw new Error(`Public URL content mismatch.\n  Expected: ${TEST_BODY}\n  Got     : ${publicBody}`);
  }
  console.log('OK  (content verified)');

  // 5. Delete the test object
  process.stdout.write('5. Deleting test object     ... ');
  await s3.send(new DeleteObjectCommand({ Bucket: config.r2.bucketName, Key: TEST_KEY }));
  console.log('OK');

  console.log('');
  console.log('All checks passed. R2 is configured correctly.');
}

run().catch((err: Error) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
