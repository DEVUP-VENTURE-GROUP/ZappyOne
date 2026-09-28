/**
 * One-time: apply the CORS policy the browser KYC/document uploads need.
 *
 * Direct-to-S3 presigned PUT uploads issue a CORS preflight (OPTIONS) from the
 * web origin. Without a bucket CORS rule the preflight fails with
 *   "No 'Access-Control-Allow-Origin' header is present on the requested resource"
 * and the upload dies. This script sets the rule using the same credentials the
 * server already uses.
 *
 *   cd server && node scripts/set-s3-cors.js
 *
 * Re-run any time you add a new web origin.
 */
require('dotenv').config();
const { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } = require('@aws-sdk/client-s3');
const config = require('../src/config');

const ORIGINS = [
  'https://www.zappyone.com',
  'https://zappyone.com',
  'http://localhost:5173',
  'http://localhost:4173',
];
if (process.env.CLIENT_URL && !ORIGINS.includes(process.env.CLIENT_URL)) {
  ORIGINS.push(process.env.CLIENT_URL);
}

async function main() {
  const { region, bucket, accessKeyId, secretAccessKey } = config.aws;
  if (!bucket) { console.error('AWS_S3_BUCKET is not set — aborting.'); process.exit(1); }

  const s3 = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });

  const CORSRules = [
    {
      AllowedOrigins: ORIGINS,
      AllowedMethods: ['GET', 'PUT', 'HEAD'],
      // '*' covers Content-Type plus any x-amz-* headers the SDK may add.
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3000,
    },
  ];

  console.log(`Applying CORS to bucket "${bucket}" (${region}) for origins:`);
  ORIGINS.forEach((o) => console.log('  •', o));

  await s3.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules } }));

  const check = await s3.send(new GetBucketCorsCommand({ Bucket: bucket }));
  console.log('\nCORS applied. Current rules:');
  console.log(JSON.stringify(check.CORSRules, null, 2));
}

main().catch((err) => {
  console.error('\nFailed to set CORS:', err.message);
  console.error('  (The IAM user needs s3:PutBucketCors on this bucket.)');
  process.exit(1);
});
