import type { NextApiRequest, NextApiResponse } from "next";

// Reuse the same archive data as in index.ts
const ARCHIVES: Record<string, Buffer> = {
  "dataset-a.zip": Buffer.from("Demo content for dataset A"),
  "dataset-b.zip": Buffer.from("Demo content for dataset B"),
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { name } = req.query;
  const data = ARCHIVES[name as string];
  if (!data) {
    res.status(404).end("Not found");
    return;
  }

  const range = req.headers.range;
  let start = 0;
  if (range) {
    const match = /bytes=(\d+)-/i.exec(range);
    if (match) {
      start = parseInt(match[1], 10);
    }
  }
  const chunk = data.slice(start);
  const end = data.length - 1;
  res.setHeader("Content-Range", `bytes ${start}-${end}/${data.length}`);
  res.status(206).send(chunk);
}
