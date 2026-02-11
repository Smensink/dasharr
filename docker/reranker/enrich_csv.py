import argparse
import csv
import os
from typing import Dict, List

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer


def pick_device(device: str) -> str:
  d = (device or "auto").lower()
  if d in ("cpu", "cuda", "mps"):
    if d == "cuda" and not torch.cuda.is_available():
      return "cpu"
    if d == "mps" and not torch.backends.mps.is_available():
      return "cpu"
    return d
  if torch.cuda.is_available():
    return "cuda"
  if torch.backends.mps.is_available():
    return "mps"
  return "cpu"


def score_pairs(
  tokenizer,
  model,
  device: str,
  queries: List[str],
  texts: List[str],
  max_length: int,
) -> List[float]:
  enc = tokenizer(
    queries,
    texts,
    padding=True,
    truncation=True,
    max_length=max_length,
    return_tensors="pt",
  )
  enc = {k: v.to(device) for k, v in enc.items()}
  with torch.no_grad():
    out = model(**enc)
    logits = out.logits
    if logits.dim() == 2 and logits.size(-1) == 1:
      scores = torch.sigmoid(logits.squeeze(-1))
    elif logits.dim() == 2 and logits.size(-1) == 2:
      scores = torch.softmax(logits, dim=-1)[:, 1]
    else:
      scores = torch.sigmoid(logits.reshape(logits.size(0), -1)[:, 0])
  return [float(x) for x in scores.detach().cpu().tolist()]


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument("--input", required=True)
  ap.add_argument("--output", required=True)
  ap.add_argument("--batch-size", type=int, default=int(os.environ.get("RERANKER_BATCH_SIZE", "64")))
  ap.add_argument("--max-length", type=int, default=int(os.environ.get("RERANKER_MAX_LENGTH", "256")))
  ap.add_argument("--model", default=os.environ.get("RERANKER_MODEL", "BAAI/bge-reranker-base"))
  ap.add_argument("--device", default=os.environ.get("RERANKER_DEVICE", "auto"))
  ap.add_argument("--max-rows", type=int, default=0, help="for debugging; 0 = all")
  args = ap.parse_args()

  device = pick_device(args.device)
  tokenizer = AutoTokenizer.from_pretrained(args.model)
  model = AutoModelForSequenceClassification.from_pretrained(args.model)
  model.eval()
  model.to(device)

  in_path = args.input
  out_path = args.output

  with open(in_path, newline="", encoding="utf-8") as f_in, open(
    out_path, "w", newline="", encoding="utf-8"
  ) as f_out:
    reader = csv.DictReader(f_in)
    if reader.fieldnames is None:
      raise SystemExit("input csv missing header")
    fieldnames = list(reader.fieldnames)
    if "reasons" not in fieldnames:
      raise SystemExit("input csv missing reasons column")
    writer = csv.DictWriter(f_out, fieldnames=fieldnames)
    writer.writeheader()

    buf_rows: List[Dict[str, str]] = []
    buf_q: List[str] = []
    buf_t: List[str] = []
    total = 0

    def flush():
      nonlocal total
      if not buf_rows:
        return
      scores = score_pairs(tokenizer, model, device, buf_q, buf_t, args.max_length)
      for row, s in zip(buf_rows, scores):
        reasons = (row.get("reasons") or "").strip()
        # Remove any existing reranker score to avoid duplicates.
        parts = [p.strip() for p in reasons.split("|") if p.strip() and not p.strip().startswith("reranker score ")]
        parts.append(f"reranker score {s:.3f}")
        row["reasons"] = "|".join(parts)
        writer.writerow(row)
        total += 1
      buf_rows.clear()
      buf_q.clear()
      buf_t.clear()

    for row in reader:
      if args.max_rows and total >= args.max_rows:
        break
      q = (row.get("gameName") or "").strip()
      t = (row.get("candidateTitle") or "").strip()
      if not q or not t:
        writer.writerow(row)
        total += 1
        continue
      buf_rows.append(row)
      buf_q.append(q)
      buf_t.append(t)
      if len(buf_rows) >= args.batch_size:
        flush()

    flush()

  print(f"wrote {total} rows to {out_path}")


if __name__ == "__main__":
  main()

