import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, writeFile, rm, readFile, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join, basename } from 'path';
import { createHash } from 'crypto';

const exec = promisify(execCb);

interface S3Object {
  key: string;
  lastModified: Date;
  size: number;
}

async function listObjects(bucket: string, prefix: string): Promise<S3Object[]> {
  const { stdout } = await exec(
    `aws s3 ls s3://${bucket}/${prefix} --recursive`
  );
  const lines = stdout.trim().split('\n').filter(Boolean);
  return lines.map((line) => {
    const parts = line.trim().split(/\s+/);
    const [date, time, size, ...keyParts] = parts;
    const key = keyParts.join(' ');
    return {
      key,
      size: Number(size),
      lastModified: new Date(`${date}T${time}Z`),
    };
  });
}

function groupByMonth(objs: S3Object[]): Map<string, S3Object[]> {
  const map = new Map<string, S3Object[]>();
  for (const obj of objs) {
    const ym = obj.lastModified.toISOString().slice(0, 7); // YYYY-MM
    if (!map.has(ym)) map.set(ym, []);
    map.get(ym)!.push(obj);
  }
  return map;
}

function groupByQuarter(objs: S3Object[]): Map<string, S3Object[]> {
  const map = new Map<string, S3Object[]>();
  for (const obj of objs) {
    const d = obj.lastModified;
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    const key = `${d.getUTCFullYear()}-Q${q}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(obj);
  }
  return map;
}

async function createArchive(
  type: string,
  name: string,
  objs: S3Object[],
  srcBucket: string,
  archiveBucket: string
) {
  const tmp = await mkdtemp(join(tmpdir(), 'archive-'));
  try {
    for (const obj of objs) {
      const localPath = join(tmp, basename(obj.key));
      await exec(`aws s3 cp s3://${srcBucket}/${obj.key} ${localPath}`);
    }
    const archiveName = `${name}.zip`;
    const archivePath = join(tmp, archiveName);
    await exec(`zip -j ${archivePath} ${tmp}/*`);
    const data = await readFile(archivePath);
    const hash = createHash('sha256').update(data).digest('hex');
    const { size } = await stat(archivePath);
    await exec(
      `aws s3 cp ${archivePath} s3://${archiveBucket}/archives/${type}/${archiveName}`
    );
    const dates = objs.map((o) => o.lastModified.getTime());
    return {
      path: `archives/${type}/${archiveName}`,
      size,
      checksum: hash,
      start: new Date(Math.min(...dates)).toISOString(),
      end: new Date(Math.max(...dates)).toISOString(),
    };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const srcBucket = process.env.SOURCE_BUCKET ?? 'fresco-data';
  const srcPrefix = process.env.SOURCE_PREFIX ?? '';
  const archiveBucket = process.env.ARCHIVE_BUCKET ?? 'fresco-archives';

  const objects = await listObjects(srcBucket, srcPrefix);
  const manifest: any[] = [];

  for (const [name, group] of groupByMonth(objects)) {
    manifest.push(
      await createArchive('monthly', name, group, srcBucket, archiveBucket)
    );
  }

  for (const [name, group] of groupByQuarter(objects)) {
    manifest.push(
      await createArchive('quarterly', name, group, srcBucket, archiveBucket)
    );
  }

  const manifestPath = join(tmpdir(), 'archive-manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  await exec(
    `aws s3 cp ${manifestPath} s3://${archiveBucket}/archives/index.json`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
