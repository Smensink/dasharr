import os
from typing import List, Optional

import torch
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoModelForSequenceClassification, AutoTokenizer


MODEL_NAME = os.environ.get("RERANKER_MODEL", "BAAI/bge-reranker-base")
DEVICE = os.environ.get("RERANKER_DEVICE", "auto").lower()
MAX_LENGTH = int(os.environ.get("RERANKER_MAX_LENGTH", "256"))


def pick_device() -> str:
  if DEVICE in ("cpu", "cuda", "mps"):
    if DEVICE == "cuda" and not torch.cuda.is_available():
      return "cpu"
    if DEVICE == "mps" and not torch.backends.mps.is_available():
      return "cpu"
    return DEVICE
  # auto
  if torch.cuda.is_available():
    return "cuda"
  if torch.backends.mps.is_available():
    return "mps"
  return "cpu"


app = FastAPI()

tokenizer = None
model = None
device = pick_device()


class ScoreRequest(BaseModel):
  query: str
  text: str


class BatchPair(BaseModel):
  query: str
  text: str
  id: Optional[str] = None


class BatchScoreRequest(BaseModel):
  pairs: List[BatchPair]


@app.on_event("startup")
def _load():
  global tokenizer, model
  tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
  # For most reranker models this is a single-logit classifier head.
  model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
  model.eval()
  model.to(device)


@app.get("/health")
def health():
  return {
    "ok": True,
    "model": MODEL_NAME,
    "device": device,
  }


def _score_pairs(queries: List[str], texts: List[str]) -> List[float]:
  assert tokenizer is not None and model is not None

  # Typical reranker input is [query] [SEP] [doc]
  enc = tokenizer(
    queries,
    texts,
    padding=True,
    truncation=True,
    max_length=MAX_LENGTH,
    return_tensors="pt",
  )
  enc = {k: v.to(device) for k, v in enc.items()}

  with torch.no_grad():
    out = model(**enc)
    logits = out.logits

    # Handle shapes:
    # - (batch, 1): single logit
    # - (batch, 2): binary classifier
    if logits.dim() == 2 and logits.size(-1) == 1:
      scores = torch.sigmoid(logits.squeeze(-1))
    elif logits.dim() == 2 and logits.size(-1) == 2:
      # probability of class 1
      scores = torch.softmax(logits, dim=-1)[:, 1]
    else:
      # Fallback: sigmoid on first dimension collapsed
      scores = torch.sigmoid(logits.reshape(logits.size(0), -1)[:, 0])

  return [float(x) for x in scores.detach().cpu().tolist()]


@app.post("/score")
def score(req: ScoreRequest):
  s = _score_pairs([req.query], [req.text])[0]
  return {"score": s}


@app.post("/batch_score")
def batch_score(req: BatchScoreRequest):
  if not req.pairs:
    return {"scores": []}
  queries = [p.query for p in req.pairs]
  texts = [p.text for p in req.pairs]
  scores = _score_pairs(queries, texts)
  out = []
  for pair, s in zip(req.pairs, scores):
    out.append({"id": pair.id, "score": s})
  return {"scores": out}

